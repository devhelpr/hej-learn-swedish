"""Native protocol acceptance check. Run with a built helper path as argument.
Uses only local system TTS; keep volume audible for listening verification.
"""
import json
import queue
import subprocess
import sys
import threading
import time

helper = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
events = queue.Queue()
def reader():
    for line in helper.stdout:
        events.put(json.loads(line))
threading.Thread(target=reader, daemon=True).start()
def send(action, request="test", **args):
    helper.stdin.write(json.dumps(dict(action=action, id=request, **args)) + "\n")
    helper.stdin.flush()
def expect(kind, request, timeout=20):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        event = events.get(timeout=max(.1, end-time.monotonic()))
        print(event, flush=True)
        if event.get("kind") == "error":
            raise AssertionError(event)
        if event.get("kind") == kind and event.get("id") == request:
            return event
    raise AssertionError(f"Missing {kind} for {request}")
try:
    send("voices")
    voice = expect("voices", "test")["voices"][0]["id"]
    send("speak", "one", text="I dag regnar det i Sverige. Vi går till skolan och sedan går vi hem igen.", voiceId=voice, rate=.65)
    expect("started", "one")
    send("pause")
    expect("paused", "one")
    send("resume")
    expect("started", "one")
    send("speak", "two", text="Hej Sverige.", voiceId=voice, rate=.85)
    expect("started", "two")
    expect("finished", "two")
    print("Native start/pause/resume/interruption/completion: OK")
finally:
    helper.stdin.close()
    try:
        helper.wait(timeout=5)
    except subprocess.TimeoutExpired:
        helper.kill()
        helper.wait()
