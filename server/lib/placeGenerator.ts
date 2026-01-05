/**
 * Place Generator - 地點批次採集模組
 * 
 * 此檔案已重構為多個模組，此處僅做 re-export 以維持向後相容性。
 * 
 * 模組結構：
 * - ./placeGenerator/constants.ts - 常量和類型定義
 * - ./placeGenerator/gemini.ts - Gemini AI 相關函數
 * - ./placeGenerator/places.ts - 地點搜尋和分類函數
 * - ./placeGenerator/index.ts - 統一匯出
 */

export * from './placeGenerator/index';
