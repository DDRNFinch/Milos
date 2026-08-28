import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../assets/milos-recorder-finalise-v258.js', import.meta.url), 'utf8');

class FakeDocument {
  constructor(layer) { this.layer = layer; this.listeners = []; }
  getElementById(id) { return id === 'milosVideoObservationLayer' ? this.layer : null; }
  addEventListener(type, fn) { if (type === 'click') this.listeners.push(fn); }
  dispatchClick(target) {
    const event = {
      target,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
    };
    for (const listener of this.listeners) {
      listener(event);
      if (event.stopped) break;
    }
    return event;
  }
}

class FakeTrack extends EventTarget {
  constructor() { super(); this.stopped = false; }
  stop() { this.stopped = true; this.dispatchEvent(new Event('ended')); }
}

class FakeStream {
  constructor() { this.tracks = [new FakeTrack(), new FakeTrack()]; }
  getTracks() { return this.tracks; }
}

function setup({ missingStop = false } = {}) {
  let fakeNow = 0;
  class FastDate extends Date { static now() { fakeNow += 1000; return fakeNow; } }
  const fastSetTimeout = (fn, ms = 0, ...args) => setTimeout(fn, Math.min(Number(ms) || 0, 6), ...args);
  const fastSetInterval = (fn, ms = 0, ...args) => {
    const handle = setInterval(fn, Math.min(Number(ms) || 0, 6), ...args);
    handle.unref?.();
    return handle;
  };

  class FakeMediaRecorder extends EventTarget {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.options = options;
      this.state = 'inactive';
      this.mimeType = 'video/webm';
    }
    start() { this.state = 'recording'; this.dispatchEvent(new Event('start')); }
    requestData() {
      if (this.state !== 'recording') throw new Error('inactive');
      const event = new Event('dataavailable');
      Object.defineProperty(event, 'data', { value: new Blob(['chunk'], { type: 'video/webm' }) });
      this.dispatchEvent(event);
    }
    stop() {
      if (this.state !== 'recording') throw new Error('inactive');
      fastSetTimeout(() => {
        const event = new Event('dataavailable');
        Object.defineProperty(event, 'data', { value: new Blob(['tail'], { type: 'video/webm' }) });
        this.dispatchEvent(event);
        this.state = 'inactive';
        if (!missingStop) this.dispatchEvent(new Event('stop'));
      }, 4);
    }
    unexpectedStop() {
      const event = new Event('dataavailable');
      Object.defineProperty(event, 'data', { value: new Blob(['held'], { type: 'video/webm' }) });
      this.dispatchEvent(event);
      this.state = 'inactive';
      this.dispatchEvent(new Event('stop'));
    }
  }

  const layer = { hidden: false, querySelector() { return null; } };
  const document = new FakeDocument(layer);
  let fixCalls = 0;
  const context = {
    console,
    Event,
    EventTarget,
    Blob,
    Promise,
    queueMicrotask,
    clearTimeout,
    clearInterval,
    setTimeout: fastSetTimeout,
    setInterval: fastSetInterval,
    Date: FastDate,
    document,
    MediaRecorder: FakeMediaRecorder,
    ysFixWebmDuration: (blob) => {
      fixCalls += 1;
      return Promise.resolve(new Blob([blob, 'fixed'], { type: blob.type }));
    },
  };
  context.window = context;
  vm.runInNewContext(js, context, { filename: 'milos-recorder-finalise-v258.js' });
  return { context, document, layer, getFixCalls: () => fixCalls };
}

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

test('normal finalisation keeps final dataavailable before exactly one stop', async () => {
  const { context } = setup();
  const recorder = new context.MediaRecorder(new FakeStream());
  const order = [];
  recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) order.push('data'); });
  recorder.addEventListener('stop', () => order.push('stop'));
  recorder.start();
  recorder.stop();
  await wait();
  assert.deepEqual(order, ['data', 'stop']);
  assert.equal(recorder.state, 'inactive');
});

test('missing native stop is recovered only after native recorder becomes inactive', async () => {
  const { context } = setup({ missingStop: true });
  const recorder = new context.MediaRecorder(new FakeStream());
  const order = [];
  recorder.addEventListener('dataavailable', () => order.push('data'));
  recorder.addEventListener('stop', () => order.push('stop'));
  recorder.start();
  recorder.stop();
  await wait(80);
  assert.deepEqual(order, ['data', 'stop']);
  assert.equal(recorder.state, 'inactive');
});

test('unexpected stopped recorder impersonates recording only during recovery control click', async () => {
  const { context, document } = setup();
  const recorder = new context.MediaRecorder(new FakeStream());
  recorder.start();
  recorder.unexpectedStop();
  assert.equal(recorder.state, 'inactive');

  let seenDuringClick = '';
  document.addEventListener('click', () => { seenDuringClick = recorder.state; });
  const status = {
    dataset: { mveStatus: 'competent' },
    textContent: 'Competent',
    isConnected: true,
    closest() { return this; },
    matches() { return false; },
  };
  document.dispatchClick(status);
  assert.equal(seenDuringClick, 'recording');
  await wait(20);
  assert.equal(recorder.state, 'inactive');
});

test('live observation save does not run synchronous WebM duration rewrite before persistence', async () => {
  const { context, getFixCalls } = setup();
  const blob = new Blob(['raw-webm'], { type: 'video/webm' });
  const result = await context.ysFixWebmDuration(blob, 9000, { logger: false });
  assert.equal(getFixCalls(), 0);
  assert.equal(result, blob);
});
