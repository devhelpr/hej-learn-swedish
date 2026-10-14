using System.Text.Json;
using System.Security.Cryptography;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Media.SpeechSynthesis;
using NAudio.Wave;
using SherpaOnnx;

internal class Program {
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
        using var stream = typeof(Program).Assembly.GetManifestResourceStream("voice-catalog.json")!;
        return JsonSerializer.Deserialize<JsonElement[]>(stream)!;
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
    static MemoryStream LocalAudio(string id, string text, double rate, int ticket) {
        var package = Catalog.FirstOrDefault(p => p.GetProperty("id").GetString() == id);
        if (package.ValueKind == JsonValueKind.Undefined || !Ready(package, false)) throw new Exception("Deze stem ontbreekt of is beschadigd. Installeer haar opnieuw bij Instellingen → Stemmen downloaden.");
        var dir = Folder(package);
        var key = id + ":" + File.GetLastWriteTimeUtc(Path.Combine(dir, "installed.json")).Ticks;
        if (loadedVoice != key) {
            if (!Ready(package, true)) throw new Exception("Deze stem is beschadigd. Installeer haar opnieuw bij Instellingen → Stemmen downloaden.");
            localSynth?.Dispose(); localSynth=null; loadedVoice="";
            var config = new OfflineTtsConfig();
            config.Model.Vits.Model = Path.Combine(dir, "model.onnx");
            config.Model.Vits.Tokens = Path.Combine(dir, "tokens.txt");
            config.Model.Vits.DataDir = Path.Combine(DataRoot, "espeak-ng-data");
            if (!File.Exists(Path.Combine(config.Model.Vits.DataDir, "phondata"))) throw new Exception("Spraakgegevens ontbreken. Herinstalleer de app.");
            config.Model.NumThreads = Math.Clamp(Environment.ProcessorCount / 2, 1, 4);
            config.Model.Provider = "cpu";
            if (id == "local:alma") {
                config.Model.Vits.NoiseScale = .8f;
                config.Model.Vits.NoiseScaleW = .6f;
                config.Model.Vits.LengthScale = .9f;
            }
            localSynth = new OfflineTts(config); loadedVoice=key;
        }
        var generated = localSynth!.GenerateWithCallback(text, (float)rate, 0, (samples, count) => Volatile.Read(ref epoch) == ticket ? 1 : 0);
        try {
            if (Volatile.Read(ref epoch) != ticket) throw new OperationCanceledException();
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
                audio=bytes; reader=new WaveFileReader(audio); player=new WaveOutEvent(); player.Init(reader);
                player.PlaybackStopped+=(_,e)=> { lock(Gate) { if(ticket==epoch && active==id) { active=""; Emit(new {kind=e.Exception==null?"finished":"error",id,message=e.Exception?.Message}); } } };
                if (!paused) player.Play();
                Emit(new {kind=paused?"paused":"started",id});
            }
        } catch(OperationCanceledException) { }
        catch(Exception e) { lock(Gate) { if(ticket==epoch) { active=""; Emit(new {kind="error",id,message=e.Message}); } } }
        finally { Synthesis.Release(); }
    }
    static int Main(string[] args) {
        if (args.SequenceEqual(new[] { "--verify-models" })) {
            try {
                foreach (var package in Catalog) {
                    var id = package.GetProperty("id").GetString()!;
                    foreach (var rate in new[] { .5, 1.3 }) {
                        using var audio = LocalAudio(id, "I dag är det onsdag. I Växjö kostar tre äpplen 25 kronor.", rate, epoch);
                        using var wave = new WaveFileReader(audio);
                        if (wave.TotalTime.TotalSeconds < .1 || wave.Length == 0) throw new Exception("Empty synthesis: " + id);
                        Console.WriteLine(id + " rate=" + rate + " duration=" + wave.TotalTime.TotalSeconds);
                    }
                }
                try { using var audio = LocalAudio("local:nst", "Hej Sverige.", .85, epoch - 1); throw new Exception("Cancelled synthesis was accepted"); }
                catch (OperationCanceledException) { }
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
                            var voices=SpeechSynthesizer.AllVoices.Where(v=>v.Language.Equals("sv-SE",StringComparison.OrdinalIgnoreCase)).Select(v=>new {id=v.Id,name=v.DisplayName,language=v.Language}).ToList();
                            voices.AddRange(Catalog.Where(p=>Ready(p,true)).Select(p=>new {id=p.GetProperty("id").GetString()!,name=p.GetProperty("name").GetString()! + " · lokaal",language="sv-SE"}));
                            Emit(new {kind="voices",id,voices}); break;
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
