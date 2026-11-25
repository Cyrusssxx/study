/* 回归：批注富文本保留上标/下标（2¹⁶、log₂N），不被 sanitize 剥成平铺数字 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
dom.window.eval(fs.readFileSync(path.join(ROOT, 'pwa/js/note_richtext.js'), 'utf8'));
const { sanitizeNoteHtml, isHtmlNote, loadNoteIntoEditor, serializeNote } = dom.window;

function check(name, cond) {
  if (!cond) { console.error('FAIL', name); process.exitCode = 1; }
  else console.log('PASS', name);
}

for (const raw of [
  '2<sup>16</sup> = 65536',
  'log<sub>2</sub>N 与 2<sup>16</sup>',
  '<p>协议 2<sup>k</sup> − 1</p>',
]) {
  const clean = sanitizeNoteHtml(raw);
  check('净化保留 sup/sub: ' + raw, clean === raw);
  check('识别为富文本: ' + raw, isHtmlNote(raw) === true);
  const el = document.createElement('div');
  el.contentEditable = 'true';
  loadNoteIntoEditor(el, raw);
  check('装载→序列化往返: ' + raw, serializeNote(el) === raw);
}

// 危险属性仍须剥掉；纯文本仍走纯文本路径
const evil = sanitizeNoteHtml('<sup onclick="alert(1)" style="color:red;font-size:9pt">16</sup>');
check('剥掉 onclick 与 font-size，保留 color', evil === '<sup style="color:red">16</sup>');
check('纯文本不被误判为富文本', isHtmlNote('216') === false && sanitizeNoteHtml('216') === '216');
