import fs from 'fs';
import path from 'path';

interface CheckResult {
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

const results: CheckResult[] = [];

const WHITELIST_FILES = [
  'shared/schema.ts',
];

const WHITELIST_REASON: Record<string, string> = {
  'shared/schema.ts': 'Drizzle ORM schema 需在單一文件定義以避免循環依賴',
};

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

function checkFileSize(dir: string, maxLines: number = 500) {
  const files = getAllTsFiles(dir);
  
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    const relativePath = path.relative(process.cwd(), filePath);
    
    if (WHITELIST_FILES.includes(relativePath)) {
      results.push({
        category: '檔案大小',
        status: 'pass',
        message: `${relativePath} 已加入白名單：${WHITELIST_REASON[relativePath] || '特殊例外'}`,
        details: { file: relativePath, lines, whitelisted: true }
      });
      continue;
    }
    
    if (lines > maxLines * 2) {
      results.push({
        category: '檔案大小',
        status: 'fail',
        message: `${relativePath} 有 ${lines} 行，超過 ${maxLines * 2} 行上限`,
        details: { file: relativePath, lines, limit: maxLines * 2 }
      });
    } else if (lines > maxLines) {
      results.push({
        category: '檔案大小',
        status: 'warn',
        message: `${relativePath} 有 ${lines} 行，建議控制在 ${maxLines} 行以內`,
        details: { file: relativePath, lines, suggested: maxLines }
      });
    }
  }
}

function checkMemorySync() {
  if (!fs.existsSync('docs')) return;
  
  const memoryFiles = fs.readdirSync('docs').filter(f => f.startsWith('memory-'));
  
  for (const file of memoryFiles) {
    const content = fs.readFileSync(path.join('docs', file), 'utf-8');
    const lastUpdated = content.match(/更新日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
    
    if (lastUpdated) {
      const date = new Date(lastUpdated[1]);
      const daysSinceUpdate = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 30) {
        results.push({
          category: '記憶庫',
          status: 'warn',
          message: `${file} 已超過 30 天未更新`,
          details: { file, lastUpdated: lastUpdated[1], daysSinceUpdate: Math.floor(daysSinceUpdate) }
        });
      }
    }
  }
}

function checkHardcodedNumbers(dir: string) {
  const patterns = [
    { regex: /\.default\((\d+)\)/g, name: '預設值' },
    { regex: /limit:\s*(\d+)/g, name: '限制值' },
    { regex: /quota.*?[=:]\s*(\d+)/gi, name: '額度' },
  ];
  
  const files = getAllTsFiles(dir);
  const findings: string[] = [];
  
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);
    
    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern.regex));
      for (const match of matches) {
        const num = parseInt(match[1]);
        if (num > 1 && num < 1000) {
          findings.push(`${relativePath}: ${pattern.name} = ${num}`);
        }
      }
    }
  }
  
  if (findings.length > 5) {
    results.push({
      category: '硬編碼',
      status: 'warn',
      message: `發現 ${findings.length} 處硬編碼數字，建議移至系統設定`,
      details: findings.slice(0, 10)
    });
  }
}

function checkConfigFiles() {
  const configFiles = ['tsconfig.json', 'package.json', 'drizzle.config.ts'];
  
  for (const file of configFiles) {
    if (!fs.existsSync(file)) continue;
    
    if (file.endsWith('.json')) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        JSON.parse(content);
        results.push({
          category: '設定檔',
          status: 'pass',
          message: `${file} 格式正確`
        });
      } catch (e) {
        results.push({
          category: '設定檔',
          status: 'fail',
          message: `${file} JSON 格式錯誤`,
          details: { file, error: (e as Error).message }
        });
      }
    }
  }
}

async function runHealthCheck() {
  console.log('🏥 開始架構健康檢查...\n');
  
  checkFileSize('server');
  checkFileSize('shared');
  checkFileSize('client/src');
  checkMemorySync();
  checkHardcodedNumbers('server');
  checkConfigFiles();
  
  const fails = results.filter(r => r.status === 'fail');
  const warns = results.filter(r => r.status === 'warn');
  const passes = results.filter(r => r.status === 'pass');
  
  console.log(`\n📊 檢查結果：`);
  console.log(`   ❌ 失敗：${fails.length}`);
  console.log(`   ⚠️ 警告：${warns.length}`);
  console.log(`   ✅ 通過：${passes.length}`);
  
  if (fails.length > 0) {
    console.log('\n❌ 需要立即處理：');
    fails.forEach(f => console.log(`   - ${f.message}`));
  }
  
  if (warns.length > 0) {
    console.log('\n⚠️ 建議改善：');
    warns.forEach(w => console.log(`   - ${w.message}`));
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: { fails: fails.length, warns: warns.length, passes: passes.length, total: results.length },
    results
  };
  
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
  }
  
  fs.writeFileSync('logs/architecture-report.json', JSON.stringify(report, null, 2));
  console.log('\n📝 完整報告已輸出至 logs/architecture-report.json');
  
  return report;
}

runHealthCheck();
