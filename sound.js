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

  // Подмес: фонограмма из наушников попала в микрофон. В левом канале она
  // звучит с задержкой тракта и его окраской; ищется взвешенной регрессией
  // голоса на правый канал, где вес кадра обратен его громкости: паузы весят
  // больше пения, и голос не прячет тихий подмес. Те же шаги и числа — в
  // app/layer_analyze.py бота, он проверяет запись ещё раз.
  const LEAK_RATE = 8000, LEAK_FRAME = 800;   // 8 кГц, кадр 100 мс
  const LEAK_WINDOW = 0.15;   // задержка подмеса — у сдвига по хлопкам, ± с
  const LEAK_PRE = 2, LEAK_POST = 14;  // окраска тракта: отводы до и после задержки
  const LEAK_STEADY = 0.01;   // задержка в двух половинах расходится не больше, с
  // Пороги — по слуху Дмитрия (26.10.2026): подмес к голосу от −52 дБ — отказ,
  // до −65 — предупреждение. На хлопках голоса ещё нет, там меряется доля
  // звучащего в наушниках, попавшая в микрофон: у чистых записей −62 и тише,
  // с подмесом −12…−28.
  const LEAK_REFUSE_DB = -52, LEAK_WARN_DB = -65, CLAPS_LEAK_DB = -45;
  const NOISE_WARN_DB = 30;   // пение громче тишины меньше чем на столько — шумно

  // На 8 кГц: среднее по отрезку исходных отсчётов.
  function downsample(x, rate) {
    const step = rate / LEAK_RATE, out = new Float32Array(Math.floor(x.length / step));
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
      let s = 0;
      for (let j = a; j < b; j++) s += x[j];
      out[i] = s / (b - a);
    }
    return out;
  }

  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const angle = (inverse ? 2 : -2) * Math.PI / size, wr = Math.cos(angle), wi = Math.sin(angle);
      for (let start = 0; start < n; start += size) {
        let cr = 1, ci = 0;
        for (let k = 0; k < size / 2; k++) {
          const a = start + k, b = a + size / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const next = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = next;
        }
      }
    }
  }

  function solve(a, b) {
    const n = b.length, m = a.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      const top = m[c]; m[c] = m[p]; m[p] = top;
      for (let r = c + 1; r < n; r++) {
        const f = m[r][c] / m[c][c];
        for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = m[r][n];
      for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
      x[r] = s / m[r][r];
    }
    return x;
  }

  const sum = xs => xs.reduce((s, x) => s + x, 0);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

  // Подмес на 8 кГц: уровень к голосу и к правому каналу, дБ, задержка, с, и
  // держится ли она в обеих половинах записи.
  function measureLeak(voice, right, clapsShift) {
    const R = LEAK_RATE, F = LEAK_FRAME, taps = LEAK_PRE + LEAK_POST;
    const frames = Math.floor(Math.min(voice.length, right.length) / F), n = frames * F;
    let lo = LEAK_PRE, hi = R;
    if (clapsShift != null) {
      lo = Math.max(LEAK_PRE, Math.round((clapsShift - LEAK_WINDOW) * R));
      hi = Math.max(lo + 1, Math.round((clapsShift + LEAK_WINDOW) * R));
    }
    const none = { leakDb: -200, gainDb: -200, lag: null, steady: false };
    if (!frames) return none;

    const power = new Float64Array(frames);
    for (let t = 0; t < n; t++) power[Math.floor(t / F)] += voice[t] * voice[t];
    if (!power.some(p => p > 0)) return none;
    const floor = Math.max(Array.from(power).sort((p, q) => p - q)[Math.floor(0.05 * (frames - 1))], 1e-9 * F);
    const weight = Array.from(power, p => 1 / (p + floor));

    // Взвешенная корреляция голоса с правым каналом на задержках окна,
    // кусками через FFT, отдельно по половинам записи.
    const width = hi - lo + 1;
    const size = 1 << Math.ceil(Math.log2(Math.max(16384, 2 * width)));
    const block = size - width + 1, halves = [new Float64Array(width), new Float64Array(width)];
    for (let start = 0; start < n; start += block) {
      const len = Math.min(block, n - start);
      const ar = new Float64Array(size), ai = new Float64Array(size);
      const br = new Float64Array(size), bi = new Float64Array(size);
      for (let t = 0; t < len; t++) ar[t] = voice[start + t] * weight[Math.floor((start + t) / F)];
      // b[t + m] — правый канал на hi - m раньше голоса.
      for (let i = 0; i < len + width - 1; i++) {
        const at = start + i - hi;
        br[i] = at >= 0 && at < n ? right[at] : 0;
      }
      fft(ar, ai, false);
      fft(br, bi, false);
      for (let i = 0; i < size; i++) {
        const r = ar[i] * br[i] + ai[i] * bi[i], m = ar[i] * bi[i] - ai[i] * br[i];
        ar[i] = r; ai[i] = m;
      }
      fft(ar, ai, true);
      const part = halves[Math.floor(start / F) < frames / 2 ? 0 : 1];
      for (let j = 0; j < width; j++) part[j] += ar[width - 1 - j] / size;
    }
    const best = c => { let at = 0; for (let j = 1; j < c.length; j++) if (Math.abs(c[j]) > Math.abs(c[at])) at = j; return at; };
    const total = halves[0].map((x, j) => x + halves[1][j]);
    const lag = lo + best(total);
    const lags = halves.map(c => (c.some(x => x) ? lo + best(c) : lag));

    // На найденной задержке — по кадрам корреляции голоса с отводами и
    // правого канала с самим собой; дальше всё считается только по ним.
    const first = lag - LEAK_PRE, cross = [], auto = [];
    for (let f = 0; f < frames; f++) {
      const c = new Float64Array(taps), a = new Float64Array(taps);
      for (let t = f * F; t < (f + 1) * F; t++) {
        // u(t - k) — правый канал на first + k раньше голоса.
        const at = t - first, v = voice[t], u0 = at >= 0 ? right[at] : 0;
        for (let k = 0; k < taps && at - k >= 0; k++) {
          const uk = right[at - k];
          c[k] += v * uk;
          a[k] += u0 * uk;
        }
      }
      cross.push(c);
      auto.push(a);
    }

    let weights = weight, leak = [];
    for (let round = 0; round < 3; round++) {
      const r = new Float64Array(taps), b = new Float64Array(taps);
      for (let f = 0; f < frames; f++) {
        for (let k = 0; k < taps; k++) { r[k] += weights[f] * auto[f][k]; b[k] += weights[f] * cross[f][k]; }
      }
      const matrix = [];
      for (let i = 0; i < taps; i++) {
        matrix.push(Array.from({ length: taps }, (_, j) => r[Math.abs(i - j)] + (i === j ? 1e-9 * Math.max(r[0], 1e-30) : 0)));
      }
      const h = solve(matrix, Array.from(b));
      const hh = Array.from({ length: taps }, (_, m) => {
        let s = 0;
        for (let j = 0; j + m < taps; j++) s += h[j] * h[j + m];
        return m ? 2 * s : s;
      });
      leak = auto.map(a => dot(a, hh));
      weights = leak.map((l, f) => 1 / (Math.max(power[f] - 2 * dot(cross[f], h) + l, 0) + floor));
    }

    let rightPower = 0;
    for (let t = 0; t < n; t++) rightPower += right[t] * right[t];
    const leakPower = Math.max(sum(leak), 1e-30);
    return {
      leakDb: 10 * Math.log10(leakPower / sum(power)),
      gainDb: rightPower > 0 ? 10 * Math.log10(leakPower / rightPower) : -200,
      lag: lag / R,
      steady: Math.abs(lags[0] - lags[1]) <= LEAK_STEADY * R,
    };
  }

  // Насколько пение громче тишины до фонограммы, дБ: как бот меряет шум.
  function noiseMargin(voice, start) {
    const R = LEAK_RATE, F = R / 10, frames = [];
    for (let i = Math.round(start * R); i + F <= voice.length; i += F) {
      let s = 0;
      for (let j = i; j < i + F; j++) s += voice[j] * voice[j];
      frames.push(s / F);
    }
    const sung = frames.slice().sort((p, q) => p - q)[Math.floor(frames.length * 0.8)] || 0;
    let quiet = 0, count = 0;
    for (let i = Math.round(0.2 * R); i < Math.round((start - 0.05) * R); i++) { quiet += voice[i] * voice[i]; count++; }
    return 10 * Math.log10((sung + 1e-20) / (quiet / Math.max(count, 1) + 1e-20));
  }

  // Хлопки: попадает ли мелодия из наушников в микрофон так, что петь нельзя.
  function clapsLeak(left, right, rate, clapsShift) {
    const leak = measureLeak(downsample(left, rate), downsample(right, rate), clapsShift);
    return Object.assign(leak, { refused: leak.steady && leak.gainDb >= CLAPS_LEAK_DB });
  }

  // Песня: 'refused' — в хор нельзя, 'leak' — может быть подмес, 'noise' —
  // шумно, null — чисто.
  function checkTake(left, right, rate, start, clapsShift) {
    const voice = downsample(left, rate);
    const leak = measureLeak(voice, downsample(right, rate), clapsShift);
    const margin = noiseMargin(voice, start);
    let verdict = null;
    if (leak.steady && leak.leakDb >= LEAK_REFUSE_DB) verdict = 'refused';
    else if (leak.leakDb >= LEAK_WARN_DB) verdict = 'leak';
    else if (margin < NOISE_WARN_DB) verdict = 'noise';
    return Object.assign(leak, { margin, verdict });
  }

  Object.assign(exports, {
    BEAT, MELODIES, clapsTune, findStart, clapsLatency, levels, loudness, singingStart,
    downsample, measureLeak, clapsLeak, checkTake,
  });
})(typeof module === 'object' ? module.exports : (window.Sound = {}));
