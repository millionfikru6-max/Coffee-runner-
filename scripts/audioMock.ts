/**
 * Minimal WebAudio mock so the audio graph can be exercised in Node.
 * Records every node created and every connection made, which lets the smoke
 * test assert the routing topology is actually what we intended.
 */

export interface MockLog {
  created: string[];
  connections: [string, string][];
  started: number;
}

export function installAudioMock(): MockLog {
  const log: MockLog = { created: [], connections: [], started: 0 };
  let id = 0;

  const node = (kind: string): Record<string, unknown> => {
    const name = `${kind}#${id++}`;
    log.created.push(kind);
    const param = () => ({
      value: 0,
      setValueAtTime() { return this; },
      setTargetAtTime() { return this; },
      linearRampToValueAtTime() { return this; },
      exponentialRampToValueAtTime() { return this; },
      cancelScheduledValues() { return this; },
    });
    return {
      __name: name,
      gain: param(),
      pan: param(),
      frequency: param(),
      Q: param(),
      threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
      detune: param(),
      type: '',
      buffer: null,
      loop: false,
      connect(dest: { __name?: string }) {
        log.connections.push([name, dest?.__name ?? 'destination']);
        return dest;
      },
      disconnect() {},
      start() { log.started++; },
      stop() {},
    };
  };

  class MockAudioContext {
    currentTime = 0;
    state = 'running';
    sampleRate = 48000;
    destination = { __name: 'destination' };
    createGain() { return node('gain'); }
    createOscillator() { return node('oscillator'); }
    createBiquadFilter() { return node('biquad'); }
    createStereoPanner() { return node('panner'); }
    createConvolver() { return node('convolver'); }
    createDynamicsCompressor() { return node('compressor'); }
    createBufferSource() { return node('bufferSource'); }
    createBuffer(ch: number, len: number) {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { length: len, numberOfChannels: ch, getChannelData: (i: number) => data[i] };
    }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }

  const g = globalThis as Record<string, unknown>;
  g.AudioContext = MockAudioContext;
  g.window = g.window ?? {};
  return log;
}
