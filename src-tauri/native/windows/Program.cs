using System.Text.Json;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Media.SpeechSynthesis;
using NAudio.Wave;

internal class Program {
    static readonly object Gate = new();
    static WaveOutEvent? player;
    static WaveFileReader? reader;
    static MemoryStream? audio;
    static string active = "";
    static int epoch;
    static void Emit(object data) { lock(Gate) { Console.WriteLine(JsonSerializer.Serialize(data)); Console.Out.Flush(); } }
    static void Stop() { epoch++; active=""; player?.Stop(); player?.Dispose(); reader?.Dispose(); audio?.Dispose(); player=null; reader=null; audio=null; }
    static async Task Speak(JsonElement c, int ticket) {
        var id=c.GetProperty("id").GetString()!;
        try {
            using var synth=new SpeechSynthesizer();
            var voiceId=c.GetProperty("voiceId").GetString();
            var voice=SpeechSynthesizer.AllVoices.FirstOrDefault(v=>v.Id==voiceId && v.Language.Equals("sv-SE",StringComparison.OrdinalIgnoreCase));
            if(voice==null) throw new Exception("Geen Zweedse stem. Installeer Zweedse tekst-naar-spraak in Windows-instellingen.");
            synth.Voice=voice;
            synth.Options.SpeakingRate=Math.Clamp(c.GetProperty("rate").GetDouble(),0.5,1.3);
            using var stream=await synth.SynthesizeTextToStreamAsync(c.GetProperty("text").GetString());
            var bytes=new MemoryStream();
            await stream.AsStreamForRead().CopyToAsync(bytes); bytes.Position=0;
            lock(Gate) {
                if(ticket!=epoch) { bytes.Dispose(); return; }
                audio=bytes; reader=new WaveFileReader(audio); player=new WaveOutEvent(); player.Init(reader); active=id;
                player.PlaybackStopped+=(_,e)=> { lock(Gate) { if(ticket==epoch) { active=""; Emit(new {kind=e.Exception==null?"finished":"error",id,message=e.Exception?.Message}); } } };
                player.Play(); Emit(new {kind="started",id});
            }
        } catch(Exception e) { lock(Gate) { if(ticket==epoch) Emit(new {kind="error",id,message=e.Message}); } }
    }
    static void Main() {
        string? line;
        while((line=Console.ReadLine())!=null) {
            try {
                using var doc=JsonDocument.Parse(line); var c=doc.RootElement.Clone();
                lock(Gate) {
                    var id=c.GetProperty("id").GetString() ?? "";
                    switch(c.GetProperty("action").GetString()) {
                        case "voices": Emit(new {kind="voices",id,voices=SpeechSynthesizer.AllVoices.Where(v=>v.Language.Equals("sv-SE",StringComparison.OrdinalIgnoreCase)).Select(v=>new {id=v.Id,name=v.DisplayName,language=v.Language})}); break;
                        case "speak": Stop(); _=Speak(c,epoch); break;
                        case "stop": Stop(); break;
                        case "pause": player?.Pause(); if(active!="") Emit(new {kind="paused",id=active}); break;
                        case "resume": player?.Play(); if(active!="") Emit(new {kind="started",id=active}); break;
                    }
                }
            } catch(Exception e) { Emit(new {kind="error",id="",message=e.Message}); }
        }
        lock(Gate) Stop();
    }
}
