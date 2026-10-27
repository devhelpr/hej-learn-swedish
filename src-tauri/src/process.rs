//! Background workers must never create or inherit a Windows console.
use std::{ffi::OsStr, process::Command};

pub fn background(program: impl AsRef<OsStr>) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new(program);
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        command
    }
    #[cfg(not(windows))]
    {
        Command::new(program)
    }
}

pub fn background_async(program: impl AsRef<OsStr>) -> tokio::process::Command {
    background(program).into()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::process::Stdio;

    // Check the actual child console and redirected UTF-8 pipes on Windows.
    // A visible (or inherited) console gives a nonzero GetConsoleWindow handle.
    const PROBE: &str = r#"
Add-Type -Namespace Hej -Name ConsoleProbe -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'
if ([Hej.ConsoleProbe]::GetConsoleWindow() -ne [IntPtr]::Zero) { exit 42 }
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::WriteLine([Console]::ReadLine())
"#;

    #[test]
    fn synchronous_worker_has_no_console_and_preserves_pipes() {
        use std::io::Write;
        let mut child = background("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                PROBE,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all("Åsa äter på ön.\n".as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success(), "{:?}", output);
        assert_eq!(
            String::from_utf8(output.stdout).unwrap().trim(),
            "Åsa äter på ön."
        );
    }

    #[tokio::test]
    async fn asynchronous_worker_has_no_console_and_preserves_pipes() {
        use tokio::io::AsyncWriteExt;
        let mut child = background_async("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                PROBE,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all("Åsa äter på ön.\n".as_bytes())
            .await
            .unwrap();
        let output = child.wait_with_output().await.unwrap();
        assert!(output.status.success(), "{:?}", output);
        assert_eq!(
            String::from_utf8(output.stdout).unwrap().trim(),
            "Åsa äter på ön."
        );
    }
}
