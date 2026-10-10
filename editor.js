(() => {
  const $ = selector => document.querySelector(selector);
  const draftKey = 'visla-cappuccino-editor-draft-v1';
  let pjson, course, selected = 0;
  const message = text => { $('#status').textContent = text; };
  function targets(select, value, answer = false) {
    select.replaceChildren();
    const choices = [[answer ? 'default' : 'next', answer ? '默认后续' : '下一场景'], ['end', '结束'],
      ...course.scenes.map((scene, index) => [scene.id, `${index + 1}. ${scene.title}`])];
    for (const [id, title] of choices) select.add(new Option(title, id));
    select.value = value;
  }
  function list() {
    const container = $('#scene-list');
    container.replaceChildren();
    course.scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.textContent = `${scene.title}${scene.quiz ? ' · 问题' : ''}`;
      button.setAttribute('aria-current', String(index === selected));
      button.onclick = () => { readFields(); selected = index; render(); };
      container.append(button);
    });
  }
  function readFields() {
    if (!course) return;
    const scene = course.scenes[selected];
    scene.next = $('#scene-next').value;
    if (!scene.quiz) return;
    const q = scene.quiz;
    q.title = $('#question').value;
    q.graded = $('#quiz-type').value === 'graded';
    q.options = [...$('#options').children].map((row, index) => ({ ...q.options[index],
      text: row.querySelector('.option-text').value, target: row.querySelector('select').value }));
    q.correct = Number($('#options input[type="radio"]:checked')?.value || 0);
  }
  function options() {
    const q = course.scenes[selected].quiz;
    const container = $('#options');
    container.replaceChildren();
    q.options.forEach((option, index) => {
      const row = document.createElement('div');
      row.className = 'option';
      row.innerHTML = '<input type="radio" name="correct"><input class="option-text" maxlength="500"><select></select><button type="button">×</button>';
      const radio = row.querySelector('input[type="radio"]');
      radio.value = index;
      radio.checked = q.correct === index;
      radio.disabled = !q.graded;
      radio.setAttribute('aria-label', `选项 ${index + 1} 为正确答案`);
      row.querySelector('.option-text').value = option.text;
      row.querySelector('.option-text').setAttribute('aria-label', `选项 ${index + 1} 文本`);
      const select = row.querySelector('select');
      select.setAttribute('aria-label', `选项 ${index + 1} 跳转目标`);
      targets(select, option.target, true);
      const remove = row.querySelector('button');
      remove.setAttribute('aria-label', `删除选项 ${index + 1}`);
      remove.disabled = q.options.length <= 2;
      remove.onclick = () => {
        readFields();
        q.options.splice(index, 1);
        if (q.correct === index) q.correct = 0;
        else if (q.correct > index) q.correct--;
        options();
      };
      container.append(row);
    });
    $('#add-option').disabled = q.options.length >= 26;
  }
  function render() {
    const scene = course.scenes[selected];
    $('#selected-scene').textContent = scene.title;
    targets($('#scene-next'), scene.next);
    $('#quiz-editor').hidden = !scene.quiz;
    $('#add-quiz').hidden = !!scene.quiz;
    $('#remove-quiz').hidden = !scene.quiz;
    if (scene.quiz) {
      $('#quiz-type').value = scene.quiz.graded ? 'graded' : 'branch';
      $('#question').value = scene.quiz.title;
      options();
    }
    list();
  }
  async function preview() {
    readFields();
    pjson = TrainingCourse.toPjson(pjson, course);
    const json = JSON.stringify(pjson);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    const id = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
    const key = `visla-training-course-${id}`;
    localStorage.setItem(key, json);
    localStorage.setItem(draftKey, json);
    $('#preview').contentWindow?.document.querySelector('#course')?.contentWindow?.dispatchEvent(new Event('pagehide'));
    localStorage.removeItem(`visla-cappuccino-scorm12-local:${key}`);
    $('#preview').src = `local-player.html?compact=1&course=${encodeURIComponent(key)}&v=cappuccino-vo-v1`;
  }
  async function action(fn) {
    try { await fn(); } catch (error) { message(error.message); }
  }
  $('#save').onclick = () => action(async () => { await preview(); message('已保存'); });
  $('#export-scorm').onclick = () => action(async () => {
    const button = $('#export-scorm');
    button.disabled = true;
    try {
      readFields();
      const output = TrainingCourse.toPjson(pjson, course);
      const blob = await SCORMZip.exportSCORM(output);
      localStorage.setItem(draftKey, JSON.stringify(output));
      pjson = output;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url;
      link.download = `${course.id}-scorm12.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('已导出 SCORM');
    } finally { button.disabled = false; }
  });
  $('#add-quiz').onclick = () => {
    readFields();
    course.scenes[selected].quiz = { id: `q-${crypto.randomUUID()}`, title: '请选择正确答案', graded: true, correct: 0, feedback: '',
      options: [{ text: '选项 A', target: 'default' }, { text: '选项 B', target: 'default' }] };
    render();
  };
  $('#remove-quiz').onclick = () => { readFields(); delete course.scenes[selected].quiz; render(); };
  $('#add-option').onclick = () => {
    readFields();
    const q = course.scenes[selected].quiz;
    if (q.options.length < 26) q.options.push({ text: `选项 ${String.fromCharCode(65 + q.options.length)}`, target: 'default' });
    options();
  };
  $('#fields').addEventListener('input', () => { if (course) { readFields(); list(); } });
  $('#quiz-type').addEventListener('change', () => { readFields(); options(); });
  action(async () => {
    const response = await fetch('cappuccino/editor-pjson.json?v=cappuccino-vo-v1');
    if (!response.ok) throw new Error(`加载失败：HTTP ${response.status}`);
    pjson = TrainingCourse.preparePjson(await response.json());
    course = TrainingCourse.fromPjson(pjson);
    const saved = localStorage.getItem(draftKey) || localStorage.getItem('visla-training-editor-draft-v1');
    if (saved) {
      const draft = TrainingCourse.fromPjson(TrainingCourse.preparePjson(JSON.parse(saved)));
      if (draft.id === course.id && draft.scenes.length === course.scenes.length && draft.scenes.every((scene, index) => scene.id === course.scenes[index].id)) {
        course.scenes.forEach((scene, index) => {
          scene.next = draft.scenes[index].next;
          if (draft.scenes[index].quiz) scene.quiz = structuredClone(draft.scenes[index].quiz);
          else delete scene.quiz;
        });
      }
    }
    render();
    await preview();
    $('#fields').disabled = false;
    $('#save').disabled = false;
    $('#export-scorm').disabled = false;
  });
})();
