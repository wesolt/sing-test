// Проверка sound.js: `node sound.test.js`. Падает на первой ошибке.
const assert = require('assert');
const Sound = require('./sound.js');

let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = () => random() * 2 - 1;

for (const rate of [48000, 44100]) {
  // Мелодии: удар и пик громкости на долях, дно посередине.
  Sound.MELODIES.forEach((_, index) => {
    const { samples, beats } = Sound.clapsTune(rate, index, random);
    assert.strictEqual(beats.length, Sound.MELODIES[index].split(' ').length);
    assert.ok(Math.abs(samples.length / rate - (beats.length * Sound.BEAT)) < 0.01);
    const rms = (t, width) => {
      const a = Math.round(t * rate), w = Math.round(width * rate);
      let s = 0;
      for (let i = a - w; i < a + w; i++) s += samples[i] ** 2;
      return Math.sqrt(s / (2 * w));
    };
    for (let k = 1; k < beats.length - 1; k++) {
      const dip = 20 * Math.log10(rms(beats[k], 0.02) / rms(beats[k] + Sound.BEAT / 2, 0.02));
      assert.ok(dip > 12, `мелодия ${index + 1}, доля ${k}: провал ${dip.toFixed(1)} дБ`);
    }
  });

  // Запись хлопков: фонограмма с задержкой страницы, хлопки с разбросом.
  const record = (latency, { claps = true, missing = 0, randomTimes = false } = {}) => {
    const { samples, beats } = Sound.clapsTune(rate, 2, random);
    const lead = 1.137, length = Math.round((lead + samples.length / rate + 1) * rate);
    const right = new Float32Array(length), left = new Float32Array(length);
    right.set(samples.map(x => x * 0.8), Math.round(lead * rate));
    // Подтекание мелодии из наушников — с настоящей задержкой.
    samples.forEach((x, i) => { left[Math.round((lead + latency) * rate) + i] += 0.004 * x; });
    for (let i = 0; i < length; i++) left[i] += 0.0005 * noise();
    if (claps) {
      beats.forEach((beat, k) => {
        if (k % 7 === 3 && missing-- > 0) return;
        const at = randomTimes
          ? lead + random() * samples.length / rate
          : lead + beat + latency + 0.02 * noise();
        const start = Math.round(at * rate);
        for (let i = 0; i < 0.03 * rate; i++) left[start + i] += 0.5 * noise() * Math.exp(-i / (0.004 * rate));
      });
    }
    return { left, right, samples, beats, lead };
  };

  for (const latency of [0.05, 0.25, 0.48]) {
    const { left, right, samples, beats, lead } = record(latency, { missing: 2 });
    const start = Sound.findStart(right, samples, rate);
    assert.ok(Math.abs(start - lead) < 0.002, `${rate}: начало ${start} вместо ${lead}`);
    const result = Sound.clapsLatency(left, rate, start, beats);
    assert.ok(result.ok, `${rate}, ${latency}: хлопки не разобраны ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.seconds - latency) < 0.015, `${rate}: задержка ${result.seconds} вместо ${latency}`);
  }

  for (const [why, options] of [['без хлопков', { claps: false }], ['хлопки невпопад', { randomTimes: true }]]) {
    const { left, right, samples, beats } = record(0.2, options);
    const result = Sound.clapsLatency(left, rate, Sound.findStart(right, samples, rate), beats);
    assert.ok(!result.ok, `${rate}: ${why} приняты за хлопки ${JSON.stringify(result)}`);
  }

  // Начало пения: три секунды тихого подтекания, потом голос.
  const voice = new Float32Array(10 * rate);
  for (let i = 0; i < voice.length; i++) {
    voice[i] = (i < 3 * rate ? 0.003 : 0.2) * Math.sin(2 * Math.PI * 220 * i / rate);
  }
  assert.ok(Math.abs(Sound.singingStart(voice, rate, 0) - 3) < 0.11);
  assert.ok(Math.abs(Sound.singingStart(voice, rate, rate) - 2) < 0.11);

  // Подмес: фонограмма — мелодии хлопков подряд, голос — своя нота с паузами,
  // в левый канал попадает фонограмма с задержкой наушников.
  const tunes = [0, 3, 5].map(index => Sound.clapsTune(rate, index, random).samples);
  const guide = new Float32Array(tunes.reduce((n, t) => n + t.length, 0));
  tunes.reduce((at, t) => { guide.set(t, at); return at + t.length; }, 0);
  const song = (gain, delay = 0.2) => {
    const lead = rate, length = lead + guide.length + rate;
    const right = new Float32Array(length), left = new Float32Array(length);
    right.set(guide.map(x => 0.5 * x), lead);
    for (let i = lead; i < length - rate; i++) {
      if (Math.floor(i / rate) % 3) left[i] = 0.2 * Math.sin(2 * Math.PI * 247 * i / rate);
      left[i] += 0.00003 * noise();
    }
    const at = Math.round(delay * rate);
    for (let i = 0; i + at < length; i++) left[i + at] += gain * right[i];
    return { left, right };
  };
  const power = x => x.reduce((s, v) => s + v * v, 0);
  for (const gain of [0.01, 0.003, 0.0003]) {
    const { left, right } = song(gain);
    const expected = 10 * Math.log10(power(right.map(x => gain * x)) / power(left));
    const result = Sound.checkTake(left, right, rate, 1, 0.25);
    assert.ok(Math.abs(result.leakDb - expected) < 1.5, `${rate}: подмес ${result.leakDb.toFixed(1)} вместо ${expected.toFixed(1)}`);
    assert.ok(Math.abs(result.lag - 0.2) < 0.002 && result.steady, `${rate}: задержка ${result.lag}`);
    assert.strictEqual(result.verdict, expected >= -52 ? 'refused' : expected >= -65 ? 'leak' : null);
  }
  const clean = song(0);
  const result = Sound.checkTake(clean.left, clean.right, rate, 1, 0.25);
  assert.ok(result.leakDb < -90 && result.verdict === null, `${rate}: чистая запись ${JSON.stringify(result)}`);
  // На хлопках голоса нет: петь нельзя, если в микрофон попадает много звучащего.
  const loud = song(0.03), faint = song(0.0003);
  assert.ok(Sound.clapsLeak(loud.left, loud.right, rate, 0.25).refused);
  assert.ok(!Sound.clapsLeak(faint.left, faint.right, rate, 0.25).refused);
}

console.log('sound.js: всё сходится');
