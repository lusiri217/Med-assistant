/* ============================================================
   crypto.js —— API Key 本地加密 / 解密（Web Crypto AES-GCM）
   设计原则：
   1) 优先使用 Web Crypto（AES-GCM），口令由「内置盐 + 浏览器指纹」派生；
   2) 在 file:// 等非安全上下文 crypto.subtle 不可用时，降级为异或混淆
      （仅提高读取门槛，非真加密），并在 README 与运行时标注，建议用本地
      服务器(https/localhost)以获得完整 AES-GCM 保护；
   3) 明文 Key 永不出现在日志 / 报错 / URL 中。
   挂载到 window.App.crypto
   ============================================================ */
window.App = window.App || {};

App.crypto = (function () {
  'use strict';

  // 内置静态盐（与代码一起发布，仅用于提升本地静态分析门槛）
  const STATIC_SALT = 'AIPS_STATIC_SALT_v1_9f3c2b';
  let strong = false; // 是否使用了真正的 AES-GCM

  function fingerprint() {
    const parts = [
      navigator.userAgent,
      (screen.width || 0) + 'x' + (screen.height || 0),
      (window.devicePixelRatio || 1),
      (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    ];
    return parts.join('|');
  }

  function hasSubtle() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey);
  }

  function str2bytes(s) { return new TextEncoder().encode(s); }
  function bytes2b64(bytes) {
    let bin = '';
    const arr = Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    arr.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }
  function b642bytes(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /* ---------- 真实 AES-GCM ---------- */
  async function deriveAesKey(passphrase) {
    const mat = await window.crypto.subtle.importKey(
      'raw', str2bytes(passphrase), 'PBKDF2', false, ['deriveKey']);
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: str2bytes(STATIC_SALT + fingerprint()), iterations: 100000, hash: 'SHA-256' },
      mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function aesEncrypt(plaintext) {
    const key = await deriveAesKey(fingerprint());
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ct = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, str2bytes(plaintext));
    return JSON.stringify({ v: 2, iv: bytes2b64(iv), ct: bytes2b64(ct), st: STATIC_SALT });
  }

  async function aesDecrypt(blob) {
    const obj = typeof blob === 'string' ? JSON.parse(blob) : blob;
    const key = await deriveAesKey(fingerprint());
    const iv = b642bytes(obj.iv);
    const pt = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, b642bytes(obj.ct));
    return new TextDecoder().decode(pt);
  }

  /* ---------- 降级：异或混淆（非安全，仅防随手查看） ---------- */
  function xorObfuscate(plaintext) {
    const key = STATIC_SALT + fingerprint();
    let out = '';
    for (let i = 0; i < plaintext.length; i++) {
      out += String.fromCharCode(plaintext.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return JSON.stringify({ v: 1, ct: bytes2b64(str2bytes(out)), st: STATIC_SALT });
  }
  function xorDeobfuscate(blob) {
    const obj = typeof blob === 'string' ? JSON.parse(blob) : blob;
    const bytes = b642bytes(obj.ct);
    const txt = new TextDecoder().decode(bytes);
    const key = STATIC_SALT + fingerprint();
    let out = '';
    for (let i = 0; i < txt.length; i++) {
      out += String.fromCharCode(txt.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return out;
  }

  /* ---------- 对外统一接口 ---------- */
  async function encrypt(plaintext) {
    if (hasSubtle()) { strong = true; return aesEncrypt(plaintext); }
    strong = false; return xorObfuscate(plaintext);
  }
  async function decrypt(blob) {
    if (!blob) return '';
    let obj;
    try { obj = typeof blob === 'string' ? JSON.parse(blob) : blob; } catch (e) { return ''; }
    if (obj.v === 2 && hasSubtle()) return aesDecrypt(obj);
    if (obj.v === 1) return xorDeobfuscate(obj);
    // 旧版或未识别：尝试两种
    try { if (hasSubtle()) return aesDecrypt(obj); } catch (e) {}
    try { return xorDeobfuscate(obj); } catch (e) { return ''; }
  }

  function isStrong() { return strong; }
  function supported() { return hasSubtle(); }

  return { encrypt, decrypt, isStrong, supported };
})();
