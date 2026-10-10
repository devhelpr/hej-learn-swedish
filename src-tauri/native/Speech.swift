import Foundation
import AVFoundation

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data: data, encoding: .utf8) {
        print(line); fflush(stdout)
    }
}
final class Speaker: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    let synth = AVSpeechSynthesizer()
    var requests: [ObjectIdentifier: String] = [:]
    var activeId: String?
    override init() { super.init(); synth.delegate = self }
    func handle(_ c: [String: Any]) {
        let id = c["id"] as? String ?? ""
        switch c["action"] as? String {
        case "voices":
            let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.lowercased() == "sv-se" }.map { ["id": $0.identifier, "name": $0.name, "language": $0.language] }
            emit(["kind":"voices", "id":id, "voices":voices])
        case "speak":
            synth.stopSpeaking(at: .immediate)
            guard let voiceId = c["voiceId"] as? String, let voice = AVSpeechSynthesisVoice.speechVoices().first(where: { $0.identifier == voiceId }), voice.language.lowercased() == "sv-se" else {
                emit(["kind":"error", "id":id, "message":"Geen beschikbare Zweedse stem. Installeer een sv-SE-stem in Systeeminstellingen."]); return
            }
            let utterance = AVSpeechUtterance(string: c["text"] as? String ?? "")
            utterance.voice = voice
            let rate = c["rate"] as? Double ?? 0.85
            utterance.rate = Float(min(1.3,max(0.5,rate))) * AVSpeechUtteranceDefaultSpeechRate
            requests[ObjectIdentifier(utterance)] = id
            activeId = id
            synth.speak(utterance)
        case "pause": synth.pauseSpeaking(at: .immediate)
        case "resume":
            if synth.continueSpeaking(), let current = activeId { emit(["kind":"started", "id":current]) }
        case "stop": synth.stopSpeaking(at: .immediate)
        default: emit(["kind":"error","id":id,"message":"Onbekende spraakopdracht."])
        }
    }
    func event(_ kind: String, _ utterance: AVSpeechUtterance, terminal: Bool = false) {
        let key = ObjectIdentifier(utterance)
        guard let id = requests[key] else { return }
        emit(["kind":kind,"id":id])
        if terminal { requests.removeValue(forKey: key); if activeId == id { activeId = nil } }
    }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) { event("started",u) }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { event("finished",u,terminal:true) }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { event("cancelled",u,terminal:true) }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didPause u: AVSpeechUtterance) { event("paused",u) }
}
let speaker = Speaker()
DispatchQueue.global().async {
    while let line = readLine() {
        guard let data = line.data(using:.utf8), let command = try? JSONSerialization.jsonObject(with:data) as? [String:Any] else { continue }
        DispatchQueue.main.async { speaker.handle(command) }
    }
    DispatchQueue.main.async { speaker.synth.stopSpeaking(at:.immediate); exit(0) }
}
RunLoop.main.run()
