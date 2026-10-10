(async () => {
  const $ = selector => document.querySelector(selector);
  let course;
  try {
    const key = new URLSearchParams(location.search).get('course');
    if (key) {
      if (!/^visla-training-course-[a-f0-9]{64}$/.test(key)) throw new Error('预览课程标识无效');
      const saved = localStorage.getItem(key);
      if (!saved) throw new Error('预览课程不存在，请回编辑器保存');
      course = TrainingCourse.fromPjson(TrainingCourse.preparePjson(JSON.parse(saved)));
    } else {
      const response = await fetch('pjson.json?v=cappuccino-vo-v1');
      if (!response.ok) throw new Error(`课程加载失败：HTTP ${response.status}`);
      course = TrainingCourse.fromPjson(await response.json());
    }
  } catch (error) {
    $('#course-title').textContent = '课程无法启动';
    $('#lms-status').textContent = error.message;
    return;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(course)));
  const revision = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
  function findAPI(start) {
    let current = start;
    for (let depth = 0; current && depth < 100; depth++) {
      try {
        if (current.API) return current.API;
        if (current.parent === current) break;
        current = current.parent;
      } catch (_) { break; }
    }
    return null;
  }
  let api = findAPI(window);
  if (!api) { try { api = findAPI(window.opener || window.top.opener); } catch (_) {} }
  const video = $('#video'), audio = $('#voiceover'), next = $('#next'), prev = $('#prev'), quiz = $('#quiz');
  const started = Date.now(), events = [];
  let active = false, scene = course.scenes[0], answers = Object.create(null), history = [], finished = false, currentQuestion = null;
  const hasAnswer = q => Object.hasOwn(answers, q.id);
  function event(type, detail) {
    events.push({ type, ...detail });
    $('#events').textContent = events.slice(-50).map(e => JSON.stringify(e)).join('\n');
  }
  function call(method, ...args) {
    if (!api) return '';
    try {
      const value = api[method](...args), error = api.LMSGetLastError();
      if (String(error) !== '0') $('#lms-status').textContent = `LMS error ${error}: ${method} — ${api.LMSGetErrorString(error)}`;
      return value;
    } catch (error) { $('#lms-status').textContent = `LMS error: ${error.message}`; return ''; }
  }
  const get = key => active ? call('LMSGetValue', key) : '';
  const set = (key, value) => { if (active) call('LMSSetValue', key, String(value)); };
  function save() {
    if (!active) return;
    const state = JSON.stringify({ version: 1, revision, scene: scene.id, time: Math.max(0, (video.currentTime || 0) - (scene.videoStart || 0)), answers, history, finished });
    if (state.length > 4096) { $('#lms-status').textContent = '恢复数据超过 SCORM 1.2 的 4096 字符预算，未保存；请缩小课程或路径状态。'; return; }
    set('cmi.core.lesson_location', scene.id);
    set('cmi.core.exit', finished ? '' : 'suspend');
    set('cmi.suspend_data', state);
    call('LMSCommit', '');
  }
  function syncVoice(play = false) {
    const voice = scene.voiceOver;
    if (!voice || currentQuestion || finished) { audio.pause(); return; }
    const time = voice.start + video.currentTime - (scene.videoStart || 0) - voice.offset;
    if (time < voice.start || time >= voice.end) { audio.pause(); return; }
    if (Math.abs(audio.currentTime - time) > .25) audio.currentTime = time;
    audio.playbackRate = video.playbackRate;
    if (play && audio.paused) {
      const current = scene;
      audio.play().catch(error => {
        if (scene === current && error.name !== 'AbortError') $('#voice-status').textContent = '旁白未能播放，请点击视频播放按钮重试。';
      });
    }
  }
  function endScene() {
    audio.pause();
    video.pause();
    if (scene.quiz && !hasAnswer(scene.quiz) && !finished) showQuestion(scene.quiz);
  }
  function loadScene(target, autoplay = false, time = 0) {
    audio.pause();
    video.pause();
    scene = target;
    currentQuestion = null;
    quiz.hidden = true;
    $('#result').hidden = true;
    $('#scene-title').textContent = scene.title;
    $('#narration').textContent = scene.narration;
    $('#progress').textContent = `Scene ${course.scenes.indexOf(scene) + 1} of ${course.scenes.length}`;
    prev.disabled = history.length === 0;
    next.disabled = false;
    next.textContent = scene.next === 'end' ? 'Finish / Answer' : 'Next scene';
    $('#media-status').textContent = scene.video ? '' : '此 Scene 没有视频，可阅读文本并点击 Next。';
    video.hidden = !scene.video;
    video.volume = scene.videoVolume ?? 1;
    $('#voice-status').textContent = '';
    $('#mute-voice').hidden = !scene.voiceOver;
    audio.onloadedmetadata = () => syncVoice(!video.paused);
    if (scene.voiceOver) { audio.src = scene.voiceOver.url; audio.volume = scene.voiceOver.volume; }
    else audio.removeAttribute('src');
    audio.load();
    video.onloadedmetadata = () => {
      const position = (scene.videoStart || 0) + time;
      if (position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, video.duration);
      syncVoice(!video.paused);
    };
    if (scene.video) video.src = scene.video;
    else video.removeAttribute('src');
    video.load();
    if (autoplay && scene.video) video.play().catch(() => {});
    event('scene', { id: scene.id });
    if (!time) save();
  }
  function showQuestion(q) {
    if (currentQuestion || hasAnswer(q)) return;
    currentQuestion = q;
    audio.pause();
    video.pause();
    quiz.hidden = false;
    next.disabled = true;
    $('#continue').disabled = true;
    $('#question').textContent = q.title;
    $('#feedback').textContent = '';
    const options = $('#answers');
    options.replaceChildren();
    q.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.text;
      button.onclick = () => {
        if (hasAnswer(q)) return;
        answers[q.id] = index;
        [...options.children].forEach(b => b.disabled = true);
        const correct = q.correct === index;
        $('#feedback').textContent = `${q.graded ? (correct ? '回答正确。' : '回答不正确。') : '已记录选择。'} ${q.feedback}`;
        const count = Number.parseInt(get('cmi.interactions._count'), 10) || 0;
        const prefix = `cmi.interactions.${count}`;
        set(`${prefix}.id`, q.id);
        set(`${prefix}.type`, 'choice');
        if (q.graded) set(`${prefix}.correct_responses.0.pattern`, String.fromCharCode(97 + q.correct));
        set(`${prefix}.student_response`, String.fromCharCode(97 + index));
        set(`${prefix}.result`, q.graded ? (correct ? 'correct' : 'wrong') : 'neutral');
        set(`${prefix}.weighting`, q.graded ? 1 : 0);
        set(`${prefix}.time`, new Date().toTimeString().slice(0, 8));
        event('answer', { question: q.id, option: index, target: option.target });
        $('#continue').disabled = false;
        save();
      };
      options.append(button);
    });
    options.firstElementChild.focus();
  }
  function showResult() {
    const outcome = TrainingCourse.result(course, answers);
    audio.pause();
    video.pause();
    quiz.hidden = true;
    $('#result').hidden = false;
    next.disabled = true;
    prev.disabled = true;
    $('#score').textContent = outcome.total
      ? `成绩：${outcome.correct}/${outcome.total}（${outcome.percent} 分），${outcome.status === 'passed' ? '通过' : '未通过'}。`
      : '课程已完成。本次路径没有计分题。';
  }
  function finish() {
    finished = true;
    const outcome = TrainingCourse.result(course, answers);
    set('cmi.core.lesson_status', outcome.status);
    set('cmi.core.score.raw', outcome.percent);
    set('cmi.core.score.min', 0);
    set('cmi.core.score.max', 100);
    event('finish', outcome);
    showResult();
    save();
  }
  function advance() {
    if (finished) return;
    const q = scene.quiz;
    if (q && !hasAnswer(q)) { showQuestion(q); return; }
    const target = q ? q.options[answers[q.id]].target : scene.next;
    const destination = TrainingCourse.destination(course, scene, target);
    if (!destination) { finish(); return; }
    history.push(scene.id);
    history = history.slice(-20);
    event('jump', { from: scene.id, to: destination.id });
    loadScene(destination, true);
  }
  next.onclick = advance;
  $('#continue').onclick = () => { if (currentQuestion && hasAnswer(currentQuestion)) advance(); };
  prev.onclick = () => {
    const target = course.scenes.find(s => s.id === history.pop());
    if (target) loadScene(target, true);
  };
  video.addEventListener('play', () => syncVoice(true));
  video.addEventListener('playing', () => syncVoice(true));
  video.addEventListener('pause', () => { if (!video.ended) audio.pause(); });
  video.addEventListener('waiting', () => audio.pause());
  video.addEventListener('seeking', () => audio.pause());
  video.addEventListener('seeked', () => syncVoice(!video.paused));
  video.addEventListener('ratechange', () => { audio.playbackRate = video.playbackRate; });
  video.addEventListener('timeupdate', () => {
    if (scene.duration > 0 && video.currentTime - (scene.videoStart || 0) >= scene.duration) endScene();
    else if (!video.seeking) syncVoice(!video.paused);
  });
  video.addEventListener('ended', () => {
    if (scene.voiceOver && !audio.paused && audio.currentTime < scene.voiceOver.end) return;
    endScene();
  });
  audio.addEventListener('timeupdate', () => {
    if (scene.voiceOver && audio.currentTime >= scene.voiceOver.end) {
      audio.pause();
      if (video.ended) endScene();
    }
  });
  audio.addEventListener('ended', () => { if (video.ended) endScene(); });
  audio.addEventListener('error', () => { if (scene.voiceOver) $('#voice-status').textContent = '旁白加载失败；视频和答题仍可继续。'; });
  $('#mute-voice').onclick = () => {
    audio.muted = !audio.muted;
    $('#mute-voice').textContent = audio.muted ? '开启旁白' : '旁白静音';
    $('#mute-voice').setAttribute('aria-pressed', String(audio.muted));
  };
  video.addEventListener('error', () => { audio.pause(); $('#media-status').textContent = '视频加载失败；仍可阅读文本、点击 Next 并答题。'; });
  $('#retry').onclick = () => {
    answers = Object.create(null); history = []; finished = false;
    set('cmi.core.lesson_status', 'incomplete'); set('cmi.core.score.raw', 0);
    loadScene(course.scenes[0], true);
  };
  $('#course-title').textContent = course.title;
  document.title = course.title;
  $('#course-rule').textContent = `通过分数：${course.passPercent}`;
  let resumeTime = 0;
  if (api) {
    active = String(call('LMSInitialize', '')) === 'true';
    if (active) {
      $('#lms-status').textContent = 'Connected to SCORM 1.2 LMS.';
      const raw = get('cmi.suspend_data');
      let state;
      try { state = JSON.parse(raw); } catch (_) {}
      if (state?.revision === revision && course.scenes.some(s => s.id === state.scene)) {
        scene = course.scenes.find(s => s.id === state.scene);
        for (const item of course.scenes) {
          const q = item.quiz, answer = q && state.answers?.[q.id];
          if (q && Number.isInteger(answer) && answer >= 0 && answer < q.options.length) answers[q.id] = answer;
        }
        history = Array.isArray(state.history) ? state.history.filter(id => course.scenes.some(s => s.id === id)).slice(-20) : [];
        resumeTime = Number.isFinite(state.time) && state.time > 0 ? state.time : 0;
        finished = state.finished === true && (!scene.quiz || hasAnswer(scene.quiz));
      } else {
        set('cmi.core.lesson_status', 'incomplete');
        set('cmi.core.score.raw', 0);
        if (raw) $('#lms-status').textContent = '课程内容已变化，旧恢复状态已忽略，开始新尝试。';
      }
    }
  } else $('#lms-status').textContent = 'Preview mode: 未连接 LMS，学习结果不会持久化。';
  loadScene(scene, false, resumeTime);
  if (finished) showResult();
  function exit() {
    audio.pause();
    video.pause();
    if (!active) return;
    const seconds = Math.floor((Date.now() - started) / 1000), pad = n => String(n).padStart(2, '0');
    set('cmi.core.session_time', `${String(Math.floor(seconds / 3600)).padStart(4, '0')}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`);
    save(); call('LMSFinish', ''); active = false;
  }
  window.addEventListener('beforeunload', save);
  window.addEventListener('pagehide', exit);
  setInterval(save, 15000);
})().catch(error => { document.querySelector('#lms-status').textContent = `课程错误：${error.message}`; });
