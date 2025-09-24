import * as fs from 'fs';
import * as path from 'path';

interface ApiEndpoint {
  method: string;
  path: string;
  controller: string;
  operation?: string;
  description?: string;
}

function extractApisFromFile(filePath: string): ApiEndpoint[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const endpoints: ApiEndpoint[] = [];
  const lines = content.split('\n');
  
  let currentController = '';
  let currentOperation = '';
  let currentDescription = '';
  
  // Extract controller name
  const controllerMatch = content.match(/@Controller\(['"`]([^'"`]*?)['"`]\)/);
  if (controllerMatch) {
    currentController = controllerMatch[1];
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Extract API operation summary
    if (line.includes('@ApiOperation')) {
      const summaryMatch = line.match(/summary:\s*['"`]([^'"`]*?)['"`]/);
      if (summaryMatch) {
        currentOperation = summaryMatch[1];
      }
      const descMatch = line.match(/description:\s*['"`]([^'"`]*?)['"`]/);
      if (descMatch) {
        currentDescription = descMatch[1];
      }
    }
    
    // Extract HTTP methods and paths
    const httpMethods = ['@Get', '@Post', '@Put', '@Delete', '@Patch'];
    for (const method of httpMethods) {
      if (line.startsWith(method)) {
        const pathMatch = line.match(/@\w+\(['"`]([^'"`]*?)['"`]\)/);
        const endpoint = pathMatch ? pathMatch[1] : '';
        
        endpoints.push({
          method: method.substring(1).toUpperCase(),
          path: currentController ? `/${currentController}${endpoint ? '/' + endpoint : ''}` : endpoint,
          controller: path.basename(filePath, '.ts'),
          operation: currentOperation,
          description: currentDescription
        });
        
        // Reset for next endpoint
        currentOperation = '';
        currentDescription = '';
        break;
      }
    }
  }
  
  return endpoints;
}

function scanControllersDirectory(dir: string): ApiEndpoint[] {
  const allEndpoints: ApiEndpoint[] = [];
  
  function scanRecursively(currentDir: string) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanRecursively(fullPath);
      } else if (item.endsWith('.controller.ts')) {
        const endpoints = extractApisFromFile(fullPath);
        allEndpoints.push(...endpoints);
      }
    }
  }
  
  scanRecursively(dir);
  return allEndpoints;
}

// Extract all APIs
const srcDir = path.join(__dirname, '..', 'src');
const allEndpoints = scanControllersDirectory(srcDir);

// Group by controller
const groupedEndpoints = allEndpoints.reduce((acc, endpoint) => {
  const key = endpoint.controller;
  if (!acc[key]) {
    acc[key] = [];
  }
  acc[key].push(endpoint);
  return acc;
}, {} as Record<string, ApiEndpoint[]>);

// Generate comprehensive report
console.log(`
🚀 ChemChat API Comprehensive Analysis

📊 TOTAL ENDPOINTS: ${allEndpoints.length}

📋 BREAKDOWN BY CONTROLLER:
`);

Object.entries(groupedEndpoints).forEach(([controller, endpoints]) => {
  console.log(`\n🔸 ${controller.replace('.controller', '').toUpperCase()} (${endpoints.length} endpoints)`);
  endpoints.forEach(endpoint => {
    console.log(`   ${endpoint.method.padEnd(6)} ${endpoint.path}`);
    if (endpoint.operation) {
      console.log(`          📝 ${endpoint.operation}`);
    }
  });
});

console.log(`\n📈 SUMMARY BY HTTP METHOD:`);
const methodCounts = allEndpoints.reduce((acc, endpoint) => {
  acc[endpoint.method] = (acc[endpoint.method] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

Object.entries(methodCounts).forEach(([method, count]) => {
  console.log(`   ${method}: ${count} endpoints`);
});

console.log(`\n🏷️ CONTROLLER MODULES:`);
Object.keys(groupedEndpoints).forEach(controller => {
  const moduleName = controller.replace('.controller', '').replace(/([A-Z])/g, ' $1').trim();
  console.log(`   • ${moduleName} Module`);
});

// Export for Swagger generation
export { allEndpoints, groupedEndpoints };
