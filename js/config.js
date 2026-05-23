/**
 * config.js — 環境設定集中管理
 *
 * 移交客戶帳號時只需更新此檔案：
 *   1. 客戶部署 Apps Script → 取得新 API_URL
 *   2. 客戶設定 STAFF_TOKEN Script Property → 填入下方
 *   3. 客戶建立 Google Forms → 填入 FORM_URL_M1
 */

const CONFIG = {
  // Apps Script Web App URL
  API_URL: 'https://script.google.com/macros/s/AKfycbzgTCDwI9yo6RgK41fhq8UoyWR7nxGQsgzFWm6U80tRFc__bUMC-u6sVCLgusuwFYln/exec',

  // 與 Apps Script Script Properties 的 STAFF_TOKEN 一致
  STAFF_TOKEN: 'act2026token',

  // 使命① 問卷連結（Google Forms，活動方提供）
  FORM_URL_M1: 'https://forms.gle/XXXXXXXX',
};
