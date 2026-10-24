// Звук и разбор для страницы записи «Слоёной песни»: мелодия для хлопков,
// где в записи началась фонограмма, задержка наушников по хлопкам и где
// человек запел. Без DOM — проверка в node: `node sound.test.js`.
(function (exports) {
  // 80 ударов в минуту: задержка Bluetooth-наушников меньше доли, и хлопок
  // не путается со следующим ударом.
  const BEAT = 0.75;
  // Между ударами нота затихает на столько и тем же темпом нарастает.
  const DEPTH_DB = 14;
  const HARMONICS = [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]];
  const NOTE = { G2: 55, A2: 57, Bb2: 58, B2: 59, C3: 60, D3: 62, E3: 64, F3: 65, G3: 67, A3: 69 };
  // Песни нашего репертуара, по ноте на долю; «/» — два голоса. Сняты с piano
  // roll Дмитрия, C3 по Logic — до первой октавы.
  const MELODIES = [
    'A2 A2 C3 D3 E3 E3 D3 C3 E3 D3 B2 D3 C3 C3 D3 B2 A2 A2 A2 A2',
    'C3 C3 C3 A2 F3 E3 D3 D3 D3 C3 B2 C3 A2 A2 C3 C3 C3 D3 B2 B2 A2',
    'E3 C3 C3 C3 E3 C3 C3 D3 B2 A2 A2 A2 G2 C3 C3 D3 C3 B2 G2 G2',
    'E3 D3 C3 C3 D3 Bb2 A2 A2 F3 D3 C3 C3 D3 Bb2 A2 A2 D3 D3 D3 D3',
    'A2 A2 E3 C3 D3 D3 E3 E3 A2 E3 E3 D3 C3 C3 A2 A2 A2 E3 E3 D3',
    'C3 C3 C3 G2 C3 D3 E3 F3 G3 F3 E3 D3 E3 E3 G3/E3 F3 E3 F3/D3 E3/C3 D3/B2',
    'A3/F3 A3/F3 G3/E3 F3/D3 E3/C3 F3/D3 G3/E3 G3/E3 E3/C3 E3/C3 ' +
      'A3/F3 A3/F3 G3/E3 F3/D3 E3/C3 F3/D3 G3/E3 G3/E3 E3/C3 E3/C3',
    'C3 C3 D3 G3/E3 G3/E3 E3/C3 F3 G3/E3 D3 D3 G3 G3 G3 A3/F3 G3 G3/E3 E3 G3/C3 F3 G3/E3',
  ];

  // Разбор хлопков.
  const SKIP_BEATS = 4;      // первые удары — человек ловит темп
  const SEARCH = [-0.1, 0.65]; // где искать хлопок от удара, с
  const TOLERANCE = 0.04;    // хлопки дальше от общего — промахи
  const MIN_CLAPS = 10;      // из 16 ударов
  const MIN_PEAK = 0.02;     // тише — это подтекание из наушников, а не хлопок

  // В точке хлопка — удар, пик громкости и смена ноты.
  function clapsTune(rate, index, random = Math.random) {
    const steps = MELODIES[index].split(' ').map(step => step.split('/').map(name => NOTE[name]));
    const last = steps.length - 1;
    const hop = Math.round(BEAT * rate), lead = Math.floor(hop / 2), xfade = 2 * Math.round(0.005 * rate);
    const total = lead + hop * last + Math.floor(hop / 2);
    const tone = new Float32Array(total);

    steps.forEach((midis, i) => {
      // Нота звучит от своего удара до следующего; соседние переходят друг
      // в друга за 10 мс по мощности, переход прикрыт ударом.
      const a = i ? lead + hop * i - xfade / 2 : 0;
      const b = i < last ? lead + hop * (i + 1) + xfade / 2 : total;
      const freqs = midis.map(midi => 440 * 2 ** ((midi - 69) / 12));
      for (let n = a; n < b; n++) {
        const t = (n - a) / rate;
        let v = 0;
        for (const f of freqs) {
          for (const [k, w] of HARMONICS) {
            v += w * (Math.sin(2 * Math.PI * f * k * t) + 0.3 * Math.sin(2 * Math.PI * f * k * 1.0012 * t));
          }
        }
        v /= Math.sqrt(freqs.length);
        if (i && n - a < xfade) v *= Math.sin((n - a) / xfade * Math.PI / 2);
        if (i < last && b - 1 - n < xfade) v *= Math.sin((b - 1 - n) / xfade * Math.PI / 2);
        tone[n] += v;
      }
    });

    const top = tone.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    const samples = new Float32Array(total);
    for (let n = 0; n < total; n++) {
      const k = Math.min(last, Math.max(0, Math.round((n - lead) / hop)));
      const away = Math.min(1, Math.abs(n - lead - hop * k) / (hop / 2));
      samples[n] = tone[n] / top * 10 ** (-DEPTH_DB * away / 20);
    }

    // Удар — деревянный стук.
    const hit = new Float32Array(Math.round(0.2 * rate)), click = Math.round(0.002 * rate);
    for (let n = 0; n < hit.length; n++) {
      const t = n / rate;
      hit[n] = 0.5 * (Math.sin(2 * Math.PI * 2500 * t) + 0.5 * Math.sin(2 * Math.PI * 3720 * t)) * Math.exp(-t / 0.025);
      if (n < click) hit[n] += 0.5 * 1.7 * (random() * 2 - 1) * (1 - n / click);
    }
    const beats = steps.map((_, i) => (lead + hop * i) / rate);
    for (let i = 0; i <= last; i++) {
      const at = lead + hop * i;
      for (let n = 0; n < hit.length && at + n < total; n++) samples[at + n] += hit[n];
    }
    for (let n = 0; n < xfade; n++) samples[total - 1 - n] *= Math.sin(n / xfade * Math.PI / 2);

    const loudest = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    for (let n = 0; n < total; n++) samples[n] *= 0.89 / loudest;
    return { samples, beats };
  }

  // Кадры по миллисекунде; длина кадра — в секундах, чтобы не копить ошибку
  // на 44.1 кГц.
  function frameOf(rate) {
    const step = Math.round(rate / 1000);
    return { step, seconds: step / rate };
  }

  function envelope(x, rate) {
    const { step } = frameOf(rate), out = new Float32Array(Math.floor(x.length / step));
    let mean = 0;
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (let j = i * step; j < (i + 1) * step; j++) s += Math.abs(x[j]);
      out[i] = s / step;
      mean += out[i] / out.length;
    }
    for (let i = 0; i < out.length; i++) out[i] -= mean;
    return out;
  }

  // Где в записи началась фонограмма, с: правый канал — её цифровая копия.
  // Время записи и время фонограммы на странице не совпадают на десятки мс.
  function findStart(right, ref, rate) {
    const a = envelope(ref.subarray(0, Math.round(10 * rate)), rate);
    const b = envelope(right.subarray(0, Math.round(15 * rate)), rate);
    let best = -Infinity, lag = 0;
    for (let l = 0; l + a.length <= b.length; l++) {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += a[i] * b[l + i];
      if (s > best) { best = s; lag = l; }
    }
    return lag * frameOf(rate).seconds;
  }

  const median = xs => {
    const s = [...xs].sort((p, q) => p - q);
    return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN;
  };

  // Задержка от удара до хлопка, с. Хлопок — резкий скачок энергии перепадов:
  // пение и подтекание мелодии в микрофон плавнее.
  function clapsLatency(left, rate, start, beats) {
    const { step, seconds } = frameOf(rate), count = Math.floor(left.length / step);
    const energy = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let s = 0;
      for (let j = Math.max(1, i * step); j < (i + 1) * step; j++) s += (left[j] - left[j - 1]) ** 2;
      energy[i] = s;
    }

    const found = [];
    for (let k = SKIP_BEATS; k < beats.length; k++) {
      const beat = Math.round((start + beats[k]) / seconds);
      let best = -Infinity, at = -1;
      const from = Math.max(30, beat + Math.round(SEARCH[0] / seconds));
      const to = Math.min(count, beat + Math.round(SEARCH[1] / seconds));
      for (let i = from; i < to; i++) {
        let before = 0;
        for (let q = i - 30; q < i - 10; q++) before += energy[q];
        if (energy[i] - before / 20 > best) { best = energy[i] - before / 20; at = i; }
      }
      if (at < 0) continue;
      let peak = 0;
      for (let j = Math.max(0, (at - 2) * step); j < Math.min(left.length, (at + 6) * step); j++) {
        peak = Math.max(peak, Math.abs(left[j]));
      }
      found.push({ offset: (at - beat) * seconds, peak });
    }

    const middle = median(found.map(f => f.offset));
    const near = found.filter(f => Math.abs(f.offset - middle) <= TOLERANCE);
    const peak = median(near.map(f => f.peak));
    return {
      ok: near.length >= MIN_CLAPS && peak >= MIN_PEAK,
      seconds: median(near.map(f => f.offset)),
      offsets: found.map(f => Math.round(f.offset * 1000)),
      peak,
    };
  }

  // Громкость по 100 мс от `from` до конца, линейно.
  function levels(x, rate, from = 0) {
    const size = Math.round(rate / 10), out = [];
    for (let i = Math.max(0, from); i + size <= x.length; i += size) {
      let s = 0;
      for (let j = i; j < i + size; j++) s += x[j] * x[j];
      out.push(Math.sqrt(s / size));
    }
    return out;
  }

  // Громкость пения: пауз в песне много, берётся громкая часть.
  const loudness = frames => [...frames].sort((p, q) => p - q)[Math.floor(frames.length * 0.8)] || 0;

  // Где человек запел, с от `from`: первый кадр не тише пения на 15 дБ.
  function singingStart(voice, rate, from) {
    const frames = levels(voice, rate, from), sung = loudness(frames);
    const first = frames.findIndex(level => level >= sung * 10 ** (-15 / 20));
    return Math.max(0, first) / 10;
  }

  Object.assign(exports, {
    BEAT, MELODIES, clapsTune, findStart, clapsLatency, levels, loudness, singingStart,
  });
})(typeof module === 'object' ? module.exports : (window.Sound = {}));
