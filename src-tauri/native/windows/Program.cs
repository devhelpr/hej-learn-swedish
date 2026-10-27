using System.Text.Json;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Media.SpeechSynthesis;
using NAudio.Wave;
using SherpaOnnx;

internal class Program {
    internal record Voice(string id, string name, string language);
    static readonly object Gate = new();
    static readonly SemaphoreSlim Synthesis = new(1);
    static readonly string VoiceRoot = Environment.GetEnvironmentVariable("HEJ_VOICE_DIR") ?? "";
    static readonly string DataRoot = Environment.GetEnvironmentVariable("HEJ_SPEECH_DATA") ?? "";
    static readonly JsonElement[] Catalog = LoadCatalog();
    static WaveOutEvent? player;
    static WaveFileReader? reader;
    static MemoryStream? audio;
    static OfflineTts? localSynth;
    static string loadedVoice = "";
    static string active = "";
    static bool paused;
    static int epoch;
    static JsonElement[] LoadCatalog() {
        using var stream = typeof(Program).Assembly.GetManifestResourceStream("voice-catalog.json")
            ?? throw new InvalidOperationException("Stemcatalogus ontbreekt. Herinstalleer de app.");
        return JsonSerializer.Deserialize<JsonElement[]>(stream)
            ?? throw new InvalidOperationException("Stemcatalogus is ongeldig. Herinstalleer de app.");
    }
    static IEnumerable<Voice> SystemVoices() => SpeechSynthesizer.AllVoices
        .Where(v=>v.Language.Equals("sv-SE",StringComparison.OrdinalIgnoreCase))
        .Select(v=>new Voice(v.Id,v.DisplayName,v.Language));
    static IEnumerable<Voice> PackageVoices(JsonElement p) {
        if (p.TryGetProperty("voices", out var voices)) return voices.EnumerateArray()
            .Select(v => new Voice(v.GetProperty("id").GetString()!, v.GetProperty("name").GetString()! + " · lokaal", "sv-SE"));
        return new[] { new Voice(p.GetProperty("id").GetString()!, p.GetProperty("name").GetString()! + " · lokaal", "sv-SE") };
    }
    static List<Voice> ListVoices(Func<IEnumerable<Voice>>? systemVoices = null) {
        var voices = Catalog.Where(p=>Ready(p,true)).SelectMany(PackageVoices).ToList();
        // Windows system speech is optional. Enumeration can fail on installations
        // without the speech components; keep downloaded voices available.
        try { voices.InsertRange(0, (systemVoices ?? SystemVoices)().ToList()); }
        catch (Exception) { }
        return voices;
    }
    static string Folder(JsonElement p) => Path.Combine(VoiceRoot, p.GetProperty("id").GetString()![6..] + "-" + p.GetProperty("version").GetString());
    static bool Ready(JsonElement p, bool verify) {
        try {
        var dir = Folder(p);
        if (VoiceRoot == "" || !File.Exists(Path.Combine(dir, "installed.json"))) return false;
        foreach (var entry in p.GetProperty("files").EnumerateObject()) {
            var path = Path.Combine(dir, entry.Name);
            if (!File.Exists(path) || new FileInfo(path).Length != entry.Value.GetProperty("size").GetInt64()) return false;
            if (verify) {
                using var stream = File.OpenRead(path);
                if (!Convert.ToHexString(SHA256.HashData(stream)).Equals(entry.Value.GetProperty("sha256").GetString(), StringComparison.OrdinalIgnoreCase)) return false;
            }
        }
        return true;
        } catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }
    static void Emit(object data) { lock(Gate) { Console.WriteLine(JsonSerializer.Serialize(data)); Console.Out.Flush(); } }
    static void Stop() {
        Interlocked.Increment(ref epoch); active=""; paused=false;
        player?.Stop(); player?.Dispose(); reader?.Dispose(); audio?.Dispose();
        player=null; reader=null; audio=null;
    }
    static void ValidateAudio(OfflineTtsGeneratedAudio generated, int ticket) {
        if (Volatile.Read(ref epoch) != ticket) throw new OperationCanceledException();
        // The native API returns a null pointer for failed/empty synthesis. Its
        // managed wrapper otherwise throws NullReferenceException while reading it.
        if (generated.Handle == IntPtr.Zero) throw new InvalidOperationException("De lokale stem heeft geen audio gemaakt. Controleer de spraakgegevens of installeer de app opnieuw.");
        if (generated.NumSamples <= 0 || generated.SampleRate <= 0) throw new InvalidOperationException("De lokale stem heeft ongeldige audio gemaakt.");
    }
    static MemoryStream LocalAudio(string id, string text, double rate, int ticket) {
        var package = Catalog.FirstOrDefault(p => p.GetProperty("id").GetString() == id || PackageVoices(p).Any(v => v.id == id));
        if (package.ValueKind == JsonValueKind.Undefined || !Ready(package, false)) throw new Exception("Deze stem ontbreekt of is beschadigd. Installeer haar opnieuw bij Instellingen → Stemmen downloaden.");
        var dir = Folder(package);
        var supertonic = package.TryGetProperty("engine", out var engine) && engine.GetString() == "supertonic";
        var speaker = supertonic && package.TryGetProperty("voices", out var speakers)
            ? speakers.EnumerateArray().Where(v => v.GetProperty("id").GetString() == id).Select(v => v.GetProperty("speaker").GetInt32()).FirstOrDefault() : 0;
        var key = package.GetProperty("id").GetString() + ":" + File.GetLastWriteTimeUtc(Path.Combine(dir, "installed.json")).Ticks;
        if (loadedVoice != key) {
            if (!Ready(package, true)) throw new Exception("Deze stem is beschadigd. Installeer haar opnieuw bij Instellingen → Stemmen downloaden.");
            localSynth?.Dispose(); localSynth=null; loadedVoice="";
            var config = new OfflineTtsConfig();
            if (supertonic) {
                string ModelPath(string file) => NativeSpeechPath.Normalize(Path.Combine(dir, file));
                config.Model.Supertonic.DurationPredictor = ModelPath("duration_predictor.int8.onnx");
                config.Model.Supertonic.TextEncoder = ModelPath("text_encoder.int8.onnx");
                config.Model.Supertonic.VectorEstimator = ModelPath("vector_estimator.int8.onnx");
                config.Model.Supertonic.Vocoder = ModelPath("vocoder.int8.onnx");
                config.Model.Supertonic.TtsJson = ModelPath("tts.json");
                config.Model.Supertonic.UnicodeIndexer = ModelPath("unicode_indexer.bin");
                config.Model.Supertonic.VoiceStyle = ModelPath("voice.bin");
            } else {
                config.Model.Vits.Model = NativeSpeechPath.Normalize(Path.Combine(dir, "model.onnx"));
                config.Model.Vits.Tokens = NativeSpeechPath.Normalize(Path.Combine(dir, "tokens.txt"));
                config.Model.Vits.DataDir = NativeSpeechPath.Normalize(Path.Combine(DataRoot, "espeak-ng-data"));
                foreach (var file in new[] { "phondata", "phontab", "phonindex", "sv_dict", "lang/gmq/sv" }) {
                    if (!File.Exists(Path.Combine(config.Model.Vits.DataDir, file))) throw new Exception($"Spraakgegevens ontbreken ({file}). Herinstalleer de app.");
                }
            }
            config.Model.NumThreads = Math.Clamp(Environment.ProcessorCount / 2, 1, 4);
            config.Model.Provider = "cpu";
            if (id == "local:alma") {
                config.Model.Vits.NoiseScale = .8f;
                config.Model.Vits.NoiseScaleW = .6f;
                config.Model.Vits.LengthScale = .9f;
            }
            localSynth = new OfflineTts(config); loadedVoice=key;
        }
        if (Volatile.Read(ref epoch) != ticket) throw new OperationCanceledException();
        var generation = new OfflineTtsGenerationConfig { Speed = (float)rate, Sid = speaker, NumSteps = 8 };
        generation.Extra["lang"] = "sv";
        var generated = supertonic
            ? localSynth!.GenerateWithConfig(text, generation, (samples, count, progress, arg) => Volatile.Read(ref epoch) == ticket ? 1 : 0)
            : localSynth!.GenerateWithCallback(text, (float)rate, 0, (samples, count) => Volatile.Read(ref epoch) == ticket ? 1 : 0);
        try {
            ValidateAudio(generated, ticket);
            var bytes = new MemoryStream();
            using (var writer = new WaveFileWriter(bytes, WaveFormat.CreateIeeeFloatWaveFormat(generated.SampleRate, 1))) {
                var samples = generated.Samples;
                writer.WriteSamples(samples, 0, samples.Length);
            }
            return new MemoryStream(bytes.ToArray());
        } finally { generated.Dispose(); }
    }
    static async Task Speak(JsonElement c, int ticket) {
        var id=c.GetProperty("id").GetString()!;
        await Synthesis.WaitAsync();
        var stage = "spraak maken";
        try {
            if (Volatile.Read(ref epoch) != ticket) return;
            var voiceId=c.GetProperty("voiceId").GetString() ?? "";
            var rate=Math.Clamp(c.GetProperty("rate").GetDouble(),0.5,1.3);
            MemoryStream bytes;
            if (voiceId.StartsWith("local:", StringComparison.Ordinal)) bytes=LocalAudio(voiceId,c.GetProperty("text").GetString()!,rate,ticket);
            else {
                using var synth=new SpeechSynthesizer();
                var voice=SpeechSynthesizer.AllVoices.FirstOrDefault(v=>v.Id==voiceId && v.Language.Equals("sv-SE",StringComparison.OrdinalIgnoreCase));
                if(voice==null) throw new Exception("Geen Zweedse stem. Kies of download een stem bij Instellingen.");
                synth.Voice=voice; synth.Options.SpeakingRate=rate;
                using var stream=await synth.SynthesizeTextToStreamAsync(c.GetProperty("text").GetString());
                bytes=new MemoryStream();
                await stream.AsStreamForRead().CopyToAsync(bytes); bytes.Position=0;
            }
            lock(Gate) {
                if(ticket!=epoch) { bytes.Dispose(); return; }
                stage = "audio openen";
                audio=bytes; reader=new WaveFileReader(audio); player=new WaveOutEvent(); player.Init(reader);
                player.PlaybackStopped+=(_,e)=> { lock(Gate) { if(ticket==epoch && active==id) { active=""; Emit(new {kind=e.Exception==null?"finished":"error",id,message=e.Exception?.Message}); } } };
                stage = "audio afspelen";
                if (!paused) player.Play();
                Emit(new {kind=paused?"paused":"started",id});
            }
        } catch(OperationCanceledException) { }
        catch(Exception e) { lock(Gate) { if(ticket==epoch) { active=""; Emit(new {kind="error",id,message=$"Fout bij {stage}: {e.Message}",details=e.ToString()}); } } }
        finally { Synthesis.Release(); }
    }
    static int Main(string[] args) {
        // This WinExe has redirected pipes but no console. Setting the console
        // encodings calls SetConsoleCP/SetConsoleOutputCP, which can throw without
        // a console. Decode/encode the pipes directly instead, without a BOM.
        var utf8 = new UTF8Encoding(false, true);
        Console.SetIn(new StreamReader(Console.OpenStandardInput(), utf8, detectEncodingFromByteOrderMarks: false));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), utf8) { AutoFlush = true });
        Console.SetError(new StreamWriter(Console.OpenStandardError(), utf8) { AutoFlush = true });
        if (args.SequenceEqual(new[] { "--verify-encoding" })) {
            using var doc = JsonDocument.Parse(Console.ReadLine() ?? "");
            Console.WriteLine(doc.RootElement.GetProperty("text").GetString());
            return 0;
        }
        if (args.SequenceEqual(new[] { "--verify-models" })) {
            try {
                var pathCases = new Dictionary<string, string> {
                    [@"\\?\C:\Users\learner\AppData\Local\Hej\speech-data\espeak-ng-data"] = "C:/Users/learner/AppData/Local/Hej/speech-data/espeak-ng-data",
                    [@"\?\C:\Users\learner\speech-data"] = "C:/Users/learner/speech-data",
                    [@"\\?\UNC\server\share\speech-data"] = "//server/share/speech-data",
                    [@"\\server\share\speech-data"] = "//server/share/speech-data",
                    [@"C:\Program Files\Hej\speech-data"] = "C:/Program Files/Hej/speech-data",
                    [@"C:\Users\Björn\speech-data"] = "C:/Users/Björn/speech-data",
                };
                foreach (var path in pathCases) {
                    if (NativeSpeechPath.Normalize(path.Key) != path.Value) throw new Exception("Native path normalization failed: " + path.Key);
                }
                var empty = new OfflineTtsGeneratedAudio(IntPtr.Zero);
                try { ValidateAudio(empty, epoch); throw new Exception("Null synthesis was accepted"); }
                catch (InvalidOperationException e) when (e.Message.Contains("geen audio")) { }
                finally { empty.Dispose(); }
                var localOnly = ListVoices(() => throw new NullReferenceException("System speech is not installed"));
                if (localOnly.Count != Catalog.Sum(p => PackageVoices(p).Count()) || localOnly.Any(v => !v.id.StartsWith("local:"))) throw new Exception("Downloaded voices require system speech");
                foreach (var voice in Catalog.SelectMany(PackageVoices)) {
                    var id = voice.id;
                    foreach (var rate in new[] { .5, 1.3 }) {
                        // Exercise the same worker-thread path used by real playback.
                        using var audio = Task.Run(() => LocalAudio(id, "Åsa går över ån. Vi äter äpplen på ön.", rate, epoch)).GetAwaiter().GetResult();
                        using var wave = new WaveFileReader(audio);
                        if (wave.TotalTime.TotalSeconds < .1 || wave.Length == 0) throw new Exception("Empty synthesis: " + id);
                        Console.WriteLine(id + " rate=" + rate + " duration=" + wave.TotalTime.TotalSeconds);
                    }
                }
                try { using var audio = LocalAudio("local:nst", "Hej Sverige.", .85, epoch - 1); throw new Exception("Cancelled synthesis was accepted"); }
                catch (OperationCanceledException) { }
                try { using var audio = LocalAudio("local:supertonic:9", "Hej Sverige.", .85, epoch - 1); throw new Exception("Cancelled Supertonic synthesis was accepted"); }
                catch (OperationCanceledException) { }
                // Reject a result cancelled after CPU synthesis has started, then
                // confirm a fresh request and a switch back to Piper still work.
                using var started = new ManualResetEventSlim();
                var ticket = epoch;
                var interrupted = Task.Run(() => {
                    started.Set();
                    using var audio = LocalAudio("local:supertonic:9", string.Join(" ", Enumerable.Repeat("Sjuksköterskan kör till sjukhuset i Växjö.", 4)), .85, ticket);
                });
                if (!started.Wait(TimeSpan.FromSeconds(5))) throw new Exception("Synthesis worker did not start");
                Thread.Sleep(20);
                Interlocked.Increment(ref epoch);
                try { interrupted.GetAwaiter().GetResult(); throw new Exception("Interrupted synthesis was accepted"); }
                catch (OperationCanceledException) { }
                using (var fresh = LocalAudio("local:supertonic:0", "Hej Sverige.", .85, epoch)) { }
                using (var switched = LocalAudio("local:nst", "Hej Sverige.", .85, epoch)) { }
                localSynth?.Dispose(); return 0;
            } catch (Exception e) { Console.Error.WriteLine(e); return 1; }
        }
        Run(); return 0;
    }
    static void Run() {
        string? line;
        while((line=Console.ReadLine())!=null) {
            try {
                using var doc=JsonDocument.Parse(line); var c=doc.RootElement.Clone();
                lock(Gate) {
                    var id=c.GetProperty("id").GetString() ?? "";
                    switch(c.GetProperty("action").GetString()) {
                        case "voices":
                            Emit(new {kind="voices",id,voices=ListVoices()}); break;
                        case "speak": Stop(); active=id; var ticket=epoch; _=Task.Run(()=>Speak(c,ticket)); break;
                        case "stop": Stop(); break;
                        case "pause": paused=true; player?.Pause(); if(active!="") Emit(new {kind="paused",id=active}); break;
                        case "resume": paused=false; player?.Play(); if(active!="" && player!=null) Emit(new {kind="started",id=active}); break;
                    }
                }
            } catch(Exception e) { Emit(new {kind="error",id="",message=e.Message}); }
        }
        lock(Gate) Stop();
        Synthesis.Wait(); localSynth?.Dispose();
    }
}
