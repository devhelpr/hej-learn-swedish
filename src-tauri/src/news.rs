use crate::model::NewsItem;
use scraper::{Html, Selector};
use std::time::Duration;
pub fn valid_url(raw: &str) -> Result<url::Url, String> {
    let u = url::Url::parse(raw).map_err(|_| "Ongeldige nieuwslink.")?;
    if u.scheme() != "https"
        || u.host_str() != Some("www.svt.se")
        || !(u.path().starts_with("/nyheter/") || u.path() == "/rss.xml")
        || u.port().is_some()
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err("Alleen HTTPS-nieuwslinks van www.svt.se worden ondersteund.".into());
    }
    Ok(u)
}
pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 {
                attempt.error("Te veel omleidingen")
            } else if valid_url(attempt.url().as_str()).is_ok() {
                attempt.follow()
            } else {
                attempt.error("Omleiding buiten SVT")
            }
        }))
        .user_agent("Hej-LearnSwedish/0.1")
        .build()
        .map_err(|e| e.to_string())
}
async fn fetch(raw: &str) -> Result<String, String> {
    valid_url(raw)?;
    let mut r = client()?
        .get(raw)
        .send()
        .await
        .map_err(|_| "SVT is niet bereikbaar. Probeer opnieuw of plak zelf tekst.")?
        .error_for_status()
        .map_err(|_| "SVT levert dit bericht of deze feed niet. Plak zelf tekst.")?;
    let mut bytes = Vec::new();
    while let Some(c) = r.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + c.len() > 2_000_000 {
            return Err("SVT-antwoord is te groot.".into());
        }
        bytes.extend(c)
    }
    String::from_utf8(bytes).map_err(|_| "Ongeldige tekstcodering.".into())
}
fn plain(raw: &str) -> String {
    Html::parse_fragment(raw)
        .root_element()
        .text()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn parse_feed(xml: &str, source: &str) -> Result<Vec<NewsItem>, String> {
    let feed = rss::Channel::read_from(xml.as_bytes())
        .map_err(|_| "De nieuwsfeed bevat geen geldige RSS. Plak zelf tekst.")?;
    Ok(feed
        .items()
        .iter()
        .filter_map(|i| {
            let link = i.link()?;
            valid_url(link).ok()?;
            Some(NewsItem {
                id: i.guid().map(|g| g.value()).unwrap_or(link).into(),
                title: plain(i.title().unwrap_or("Nieuwsbericht")),
                source: source.into(),
                url: link.into(),
                published_at: i.pub_date().map(String::from),
                summary: plain(i.description().unwrap_or("")),
            })
        })
        .take(60)
        .collect())
}
pub async fn list(region: &str) -> Result<Vec<NewsItem>, String> {
    let (path, source) = match region {
        "national" => ("https://www.svt.se/nyheter/rss.xml", "SVT Nyheter"),
        "smaland" => (
            "https://www.svt.se/nyheter/lokalt/smaland/rss.xml",
            "SVT Småland",
        ),
        _ => return Err("Onbekende nieuwsbron.".into()),
    };
    parse_feed(&fetch(path).await?, source)
}
pub fn extract(html: &str) -> Result<String, String> {
    let doc = Html::parse_document(html);
    // SVT's article body must exist: do not fall back to arbitrary page paragraphs.
    let selectors = [
        "article [class*='Lead__root'], article [class*='TextArticle__body'] p",
        "article [data-testid='article-body'] p",
        "article .nyh_article-body p",
        "article [class*='ArticleBody'] p",
        "article [class*='article-body'] p",
        "article [class*='ArticleText'] p",
    ];
    for selector in selectors {
        let sel = Selector::parse(selector).unwrap();
        let parts: Vec<String> = doc
            .select(&sel)
            .filter(|p| {
                !p.ancestors()
                    .filter_map(scraper::ElementRef::wrap)
                    .any(|a| {
                        matches!(
                            a.value().name(),
                            "nav" | "aside" | "footer" | "script" | "style"
                        )
                    })
            })
            .map(|p| plain(&p.inner_html()))
            .filter(|s| !s.is_empty())
            .collect();
        let text = parts.join("\n\n");
        if text.split_whitespace().count() >= 50 {
            return Ok(text);
        }
    }
    // SVT also publishes structured articleBody; inspect only NewsArticle entries.
    let sel = Selector::parse("script[type='application/ld+json']").unwrap();
    fn body(v: &serde_json::Value) -> Option<String> {
        if let Some(a) = v.as_array() {
            return a.iter().find_map(body);
        }
        if let Some(g) = v.get("@graph") {
            if let Some(b) = body(g) {
                return Some(b);
            }
        }
        let is_article = v
            .get("@type")
            .map(|t| {
                t.as_str() == Some("NewsArticle")
                    || t.as_array()
                        .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("NewsArticle")))
            })
            .unwrap_or(false);
        if is_article {
            v.get("articleBody").and_then(|s| s.as_str()).map(plain)
        } else {
            None
        }
    }
    for script in doc.select(&sel) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&script.inner_html()) {
            if let Some(t) = body(&v) {
                if t.split_whitespace().count() >= 50 {
                    return Ok(t);
                }
            }
        }
    }
    Err("De volledige artikeltekst kon niet worden gelezen. Open het origineel en plak de tekst hieronder.".into())
}
pub async fn article(raw: &str) -> Result<String, String> {
    extract(&fetch(raw).await?)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rss_normalizes_and_rejects_foreign_links() {
        let items = parse_feed(include_str!("../../tests/fixtures/feed.xml"), "SVT").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].summary, "Det regnar i Sverige.");
    }
    #[test]
    fn rejects_headline_only() {
        assert!(extract("<article><h1>Nyhet</h1><p>En kort rubrik.</p></article>").is_err());
    }
    #[test]
    fn extracts_article_only() {
        let text = extract(include_str!("../../tests/fixtures/article.html")).unwrap();
        assert!(!text.contains("NAVIGATION"));
        assert!(text.contains("Sverige"));
    }
    #[test]
    fn supports_canonical_feed_redirect() {
        assert!(valid_url("https://www.svt.se/rss.xml").is_ok());
        assert!(valid_url("https://www.svt.se/elsewhere").is_err());
    }
    #[test]
    fn blocks_foreign_and_credentials() {
        for u in [
            "https://example.com/nyheter/a",
            "http://www.svt.se/nyheter/a",
            "https://user@www.svt.se/nyheter/a",
        ] {
            assert!(valid_url(u).is_err());
        }
    }
}
#[cfg(test)]
mod live_tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires live SVT network access"]
    async fn live_feeds_and_article() {
        for region in ["national", "smaland"] {
            let items = list(region).await.unwrap();
            assert!(!items.is_empty());
            let mut found = false;
            for item in items.iter().take(5) {
                if let Ok(t) = article(&item.url).await {
                    assert!(t.split_whitespace().count() >= 50);
                    println!(
                        "{region}: {} — {} woorden",
                        item.title,
                        t.split_whitespace().count()
                    );
                    found = true;
                    break;
                }
            }
            assert!(found, "No complete article extracted for {region}");
        }
    }
}
