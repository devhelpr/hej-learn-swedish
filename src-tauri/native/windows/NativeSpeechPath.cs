internal static class NativeSpeechPath {
    // Rust/Tauri can supply verbatim Windows paths. eSpeak appends "/phontab"
    // and other relative names; verbatim paths disable Win32 slash normalization,
    // so those otherwise valid paths fail in the native speech library.
    public static string Normalize(string path) {
        foreach (var prefix in new[] { @"\\?\", @"\?\" }) {
            if (path.StartsWith(prefix + @"UNC\", StringComparison.OrdinalIgnoreCase)) {
                return (@"\\" + path[(prefix.Length + 4)..]).Replace('\\', '/');
            }
            if (path.StartsWith(prefix, StringComparison.Ordinal) &&
                path.Length >= prefix.Length + 3 && char.IsAsciiLetter(path[prefix.Length]) &&
                path[prefix.Length + 1] == ':' && path[prefix.Length + 2] == '\\') {
                return path[prefix.Length..].Replace('\\', '/');
            }
        }
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal) || path.StartsWith(@"\\.\", StringComparison.Ordinal)) {
            throw new InvalidOperationException("Dit Windows-pad wordt niet ondersteund door de lokale spraakengine. Installeer de app op een gewone schijf of netwerkshare.");
        }
        return path.Replace('\\', '/');
    }
}
