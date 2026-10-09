(() => {
  const encoder = new TextEncoder();
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }
  function zip(entries) {
    const parts = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const [path, content] of entries) {
      const name = encoder.encode(path), data = encoder.encode(content), crc = crc32(data);
      const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x800, true);
      view.setUint16(12, 33, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
      header.set(name, 30);
      const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x800, true);
      cv.setUint16(14, 33, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      parts.push(header, data);
      directory.push(central);
      offset += header.length + data.length;
      directorySize += central.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, directorySize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }
  const xml = text => String(text).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
  async function exportSCORM(pjson) {
    const course = TrainingCourse.fromPjson(pjson);
    const resources = ['interactive-player.html', 'interactive-player.js', 'course-model.js', 'cappuccino/style.css'];
    const content = await Promise.all(resources.map(async path => {
      const response = await fetch(path + '?v=cappuccino-video-v1');
      if (!response.ok) throw new Error(`无法加载导出资源 ${path}: HTTP ${response.status}`);
      return response.text();
    }));
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="visla-${xml(course.id)}" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org"><organization identifier="org"><title>${xml(course.title)}</title><item identifier="item" identifierref="course"><title>${xml(course.title)}</title></item></organization></organizations>
  <resources><resource identifier="course" type="webcontent" adlcp:scormtype="sco" href="index.html">
    <file href="index.html"/><file href="interactive-player.js"/><file href="course-model.js"/><file href="cappuccino/style.css"/><file href="pjson.json"/>
  </resource></resources>
</manifest>`;
    return zip([
      ['imsmanifest.xml', manifest], ['index.html', content[0]], ['interactive-player.js', content[1]],
      ['course-model.js', content[2]], ['cappuccino/style.css', content[3]], ['pjson.json', JSON.stringify(pjson, null, 2)]
    ]);
  }
  globalThis.SCORMZip = { exportSCORM };
})();
