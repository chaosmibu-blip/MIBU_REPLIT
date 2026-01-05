import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ApiEndpoint {
  method: string;
  path: string;
  auth: 'none' | 'jwt' | 'session' | 'admin';
  description?: string;
}

interface ApiContract {
  version: string;
  generatedAt: string;
  endpoints: Record<string, ApiEndpoint>;
  categories: Record<string, string[]>;
}

function extractRoutes(filePath: string, basePath: string = ''): ApiEndpoint[] {
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const endpoints: ApiEndpoint[] = [];
  
  const routePattern = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  const authPattern = /isAuthenticated|hasAdminAccess|adminKeyAuth/;
  
  let match;
  while ((match = routePattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    let routePath = match[2];
    
    if (!routePath.startsWith('/')) {
      routePath = '/' + routePath;
    }
    
    const fullPath = basePath + routePath;
    
    const lineStart = content.lastIndexOf('\n', match.index);
    const lineEnd = content.indexOf('\n', match.index + match[0].length + 100);
    const contextLine = content.substring(lineStart, lineEnd);
    
    let auth: ApiEndpoint['auth'] = 'none';
    if (contextLine.includes('hasAdminAccess') || contextLine.includes('adminKeyAuth')) {
      auth = 'admin';
    } else if (contextLine.includes('isAuthenticated')) {
      auth = 'jwt';
    }
    
    endpoints.push({
      method,
      path: fullPath,
      auth,
    });
  }
  
  return endpoints;
}

function scanRouteDirectory(dirPath: string, basePath: string = ''): ApiEndpoint[] {
  if (!fs.existsSync(dirPath)) return [];
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let allEndpoints: ApiEndpoint[] = [];
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      const indexPath = path.join(fullPath, 'index.ts');
      if (fs.existsSync(indexPath)) {
        const subRoutes = scanRouteDirectory(fullPath, basePath);
        allEndpoints = allEndpoints.concat(subRoutes);
      }
      
      for (const subEntry of fs.readdirSync(fullPath)) {
        if (subEntry.endsWith('.ts') && subEntry !== 'index.ts' && !subEntry.includes('shared')) {
          const subPath = path.join(fullPath, subEntry);
          const routes = extractRoutes(subPath, basePath);
          allEndpoints = allEndpoints.concat(routes);
        }
      }
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      const routes = extractRoutes(fullPath, basePath);
      allEndpoints = allEndpoints.concat(routes);
    }
  }
  
  return allEndpoints;
}

function categorizeEndpoints(endpoints: ApiEndpoint[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  
  for (const endpoint of endpoints) {
    const parts = endpoint.path.split('/').filter(Boolean);
    let category = 'other';
    
    if (parts.length >= 2) {
      category = parts[1] === 'api' ? (parts[2] || 'other') : parts[1];
    }
    
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(`${endpoint.method} ${endpoint.path}`);
  }
  
  return categories;
}

function generateContract() {
  console.log('🔄 正在掃描路由檔案...');
  
  const routesDir = path.resolve(__dirname, '../routes');
  const allEndpoints = scanRouteDirectory(routesDir, '/api');
  
  const uniqueEndpoints = new Map<string, ApiEndpoint>();
  for (const ep of allEndpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (!uniqueEndpoints.has(key)) {
      uniqueEndpoints.set(key, ep);
    }
  }
  
  const endpointsObj: Record<string, ApiEndpoint> = {};
  for (const [key, value] of uniqueEndpoints) {
    endpointsObj[key] = value;
  }
  
  const categories = categorizeEndpoints(Array.from(uniqueEndpoints.values()));
  
  let version = '1.0.0';
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      version = pkg.version || version;
    }
  } catch {}
  
  const contract: ApiContract = {
    version,
    generatedAt: new Date().toISOString(),
    endpoints: endpointsObj,
    categories,
  };
  
  const outputPath = path.resolve(__dirname, '../../docs/API_CONTRACT.json');
  fs.writeFileSync(outputPath, JSON.stringify(contract, null, 2));
  
  console.log(`✅ API 契約已產生：docs/API_CONTRACT.json`);
  console.log(`   📊 共 ${uniqueEndpoints.size} 個端點`);
  console.log(`   📁 分類：${Object.keys(categories).join(', ')}`);
  
  const stats = { none: 0, jwt: 0, admin: 0, session: 0 };
  for (const ep of uniqueEndpoints.values()) {
    stats[ep.auth]++;
  }
  console.log(`   🔐 認證分布：公開=${stats.none}, JWT=${stats.jwt}, Admin=${stats.admin}`);
}

generateContract();
