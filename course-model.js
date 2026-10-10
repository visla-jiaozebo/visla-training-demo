(() => {
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !['next', 'end', 'default'].includes(value);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  function validVideo(value) {
    if (value === '') return true;
    try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch (_) { return false; }
  }
  function validAudio(value) {
    return typeof value === 'string' && value !== '' && (validVideo(value) || /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:mp3|m4a|wav|ogg)$/i.test(value));
  }
  function validate(course) {
    check(isObject(course) && course.version === 1, '不支持的课程格式，要求 version=1');
    check(validId(course.id), '课程 ID 无效');
    check(typeof course.title === 'string' && course.title.trim() && course.title.length <= 200, '课程标题不能为空且不超过 200 字符');
    check(Number.isFinite(course.passPercent) && course.passPercent >= 0 && course.passPercent <= 100, '通过分数应在 0–100 之间');
    check(Array.isArray(course.scenes) && course.scenes.length > 0 && course.scenes.length <= 50, '课程应包含 1–50 个 Scene');
    const ids = new Set(), quizzes = new Set();
    for (const scene of course.scenes) {
      check(isObject(scene) && validId(scene.id) && !ids.has(scene.id), 'Scene ID 无效或重复');
      ids.add(scene.id);
    }
    for (const scene of course.scenes) {
      check(typeof scene.title === 'string' && scene.title.trim() && scene.title.length <= 200, 'Scene 标题不能为空且不超过 200 字符');
      check(typeof scene.narration === 'string' && scene.narration.length <= 20000, '旁白文本无效或过长');
      check(typeof scene.video === 'string' && validVideo(scene.video), '视频地址必须为空或 http/https URL');
      for (const field of ['videoStart', 'duration']) check(scene[field] === undefined || (Number.isFinite(scene[field]) && scene[field] >= 0), '素材时间无效');
      check(scene.videoVolume === undefined || (Number.isFinite(scene.videoVolume) && scene.videoVolume >= 0 && scene.videoVolume <= 1), '视频音量无效');
      if (scene.voiceOver) {
        const v = scene.voiceOver;
        check(isObject(v) && validAudio(v.url), '旁白地址无效');
        check(Number.isFinite(v.start) && v.start >= 0 && Number.isFinite(v.end) && v.end > v.start && Number.isFinite(v.offset) && v.offset >= 0, '旁白时间无效');
        check(Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1, '旁白音量无效');
      }
      check(['next', 'end'].includes(scene.next) || ids.has(scene.next), `Scene ${scene.title} 的跳转目标不存在`);
      if (!scene.quiz) continue;
      const q = scene.quiz;
      check(isObject(q) && validId(q.id) && !quizzes.has(q.id), '问题 ID 无效或重复');
      quizzes.add(q.id);
      check(typeof q.title === 'string' && q.title.trim() && q.title.length <= 1000, '问题不能为空且不超过 1000 字符');
      check(typeof q.graded === 'boolean', '问题类型无效');
      check(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 26, '每题应有 2–26 个选项');
      check(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length, '正确答案无效');
      check(typeof q.feedback === 'string' && q.feedback.length <= 2000, '反馈文本无效或过长');
      for (const option of q.options) {
        check(isObject(option) && typeof option.text === 'string' && option.text.trim() && option.text.length <= 500, '选项不能为空且不超过 500 字符');
        check(['default', 'end'].includes(option.target) || ids.has(option.target), '答案分支目标不存在');
      }
    }
    return course;
  }
  function projectOf(input) {
    const project = Array.isArray(input?.data?.scenes) ? input.data : input;
    check(isObject(project) && Array.isArray(project.scenes), 'PJSON 中未找到 scenes 数组');
    return project;
  }
  function fromPjson(input, title = '') {
    const project = projectOf(input);
    const training = project.training || {};
    check(isObject(training) && (training.version === undefined || training.version === 1), '不支持的 PJSON training 版本');
    const assets = project.assets || {};
    const course = {
      version: 1,
      id: String(project.projectUuid || 'imported-project'),
      title: title || training.title || project.text?.titleText?.headerText?.text?.trim() || '导入的视频课程',
      passPercent: training.passPercent ?? 67,
      scenes: project.scenes.map((scene, index) => {
        const interaction = scene.training || {};
        check(isObject(interaction), 'Scene training 必须是对象');
        const clip = scene.brolls?.[0], asset = assets[clip?.assetUuid];
        const voice = scene.voiceOvers?.[0], voiceAsset = assets[voice?.assetUuid];
        const voiceUrl = voice?.audioLink || voiceAsset?.audioLink || voiceAsset?.assetLink;
        return {
          id: String(scene.sceneUuid || `scene-${index + 1}`),
          title: interaction.title ?? scene.name ?? `Scene ${index + 1}`,
          video: interaction.videoUrl ?? (asset?.mediaType === 'video' ? asset.assetLink || asset.previewLink || '' : ''),
          videoStart: interaction.videoStart ?? (clip?.startTime || 0) / 1000,
          videoVolume: interaction.videoVolume ?? clip?.volume ?? 1,
          duration: interaction.duration ?? (scene.duration || 0) / 1000,
          voiceOver: interaction.voiceOver !== undefined ? structuredClone(interaction.voiceOver) : voiceUrl ? {
            url: voiceUrl, start: (voice.startTime || 0) / 1000, end: (voice.endTime ?? voiceAsset?.duration ?? 0) / 1000,
            offset: Math.max(0, ((voice.timeOffsetInProject || 0) - (scene.timeOffsetInProject || 0)) / 1000), volume: voice.volume ?? 1
          } : null,
          narration: interaction.narration ?? scene.transcript?.originalVoiceover ?? (scene.transcript?.sentences || []).map(s => s.content || '').join(' '),
          next: interaction.next ?? (index === project.scenes.length - 1 ? 'end' : 'next'),
          ...(interaction.quiz ? { quiz: structuredClone(interaction.quiz) } : {})
        };
      })
    };
    return validate(course);
  }
  function toPjson(input, course) {
    validate(course);
    const output = structuredClone(input), project = projectOf(output);
    check(project.scenes.length === course.scenes.length, 'PJSON Scene 数量不匹配');
    project.projectUuid ??= course.id;
    project.training = { ...project.training, version: 1, title: course.title, passPercent: course.passPercent };
    project.scenes.forEach((scene, index) => {
      const edited = course.scenes[index];
      check(String(scene.sceneUuid || `scene-${index + 1}`) === edited.id, 'PJSON Scene ID 不匹配');
      scene.sceneUuid ??= edited.id;
      scene.training = { ...scene.training, title: edited.title, videoUrl: edited.video, narration: edited.narration, next: edited.next,
        videoStart: edited.videoStart ?? 0, videoVolume: edited.videoVolume ?? 1, duration: edited.duration ?? 0, voiceOver: structuredClone(edited.voiceOver ?? null) };
      if (edited.quiz) scene.training.quiz = structuredClone(edited.quiz);
      else delete scene.training.quiz;
    });
    return output;
  }
  function preparePjson(input) {
    // Old drafts did not retain their original PJSON; migrate only the saved fields.
    if (input?.version === 1 && 'passPercent' in input) {
      validate(input);
      return toPjson({ projectUuid: input.id, scenes: input.scenes.map(scene => ({
        sceneUuid: scene.id, name: scene.title, transcript: { originalVoiceover: scene.narration }
      })) }, input);
    }
    fromPjson(input);
    return structuredClone(input);
  }
  function destination(course, scene, target = scene.next) {
    if (target === 'default') target = scene.next;
    if (target === 'end') return null;
    if (target === 'next') return course.scenes[course.scenes.indexOf(scene) + 1] || null;
    return course.scenes.find(item => item.id === target) || null;
  }
  function result(course, answers) {
    const questions = course.scenes.map(scene => scene.quiz).filter(q => q?.graded && Object.hasOwn(answers, q.id));
    const correct = questions.filter(q => answers[q.id] === q.correct).length;
    const percent = questions.length ? Math.round(correct * 100 / questions.length) : 0;
    return { correct, total: questions.length, percent, status: questions.length ? (percent >= course.passPercent ? 'passed' : 'failed') : 'completed' };
  }
  globalThis.TrainingCourse = { validate, fromPjson, toPjson, preparePjson, destination, result };
})();
