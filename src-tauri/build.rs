fn main() {
    println!(
        "cargo:rustc-env=HELPER_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
