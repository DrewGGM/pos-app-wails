#!/usr/bin/env node

/**
 * Fix Wails-generated TypeScript bindings
 *
 * This script fixes issues in the auto-generated wailsjs/go/models.ts file
 * where Wails creates references to internal GORM types that don't exist in TypeScript
 */

const fs = require('fs');
const path = require('path');

const modelsPath = path.join(__dirname, 'wailsjs', 'go', 'models.ts');

try {
  if (!fs.existsSync(modelsPath)) {
    console.log('⚠️  models.ts not found - skipping fix (bindings may not be generated yet)');
    process.exit(0);
  }

  let content = fs.readFileSync(modelsPath, 'utf8');
  let modified = false;

  // Fix 1: Replace ClauseBuilder references with 'any'
  if (content.includes('ClauseBuilder')) {
    content = content.replace(/ClauseBuilder/g, 'any');
    modified = true;
    console.log('✓ Fixed ClauseBuilder references');
  }

  // Fix 2: Make ConnPool optional and remove duplicates
  // First pass: make all ConnPool declarations optional
  if (content.includes('ConnPool:')) {
    content = content.replace(/(\s+)ConnPool:\s*any;/g, '$1ConnPool?: any;');
    modified = true;
    console.log('✓ Made ConnPool optional');
  }

  // Fix 3: Remove duplicate ConnPool declarations within the same class
  // This regex finds duplicate ConnPool declarations in the same class
  const classRegex = /export class (\w+) \{[^}]*\}/gs;
  content = content.replace(classRegex, (classMatch) => {
    const connPoolCount = (classMatch.match(/ConnPool\??: any;/g) || []).length;
    if (connPoolCount > 1) {
      // Keep only the first occurrence
      let first = true;
      return classMatch.replace(/(\s+)ConnPool\??: any;/g, (match) => {
        if (first) {
          first = false;
          return match;
        }
        modified = true;
        return ''; // Remove duplicate
      });
    }
    return classMatch;
  });

  // Fix 4: Remove duplicate ConnPool assignments in constructors
  const constructorRegex = /constructor\(source: any[^}]*\{[^}]*\}/gs;
  content = content.replace(constructorRegex, (constructorMatch) => {
    const assignmentCount = (constructorMatch.match(/this\.ConnPool = source\["ConnPool"\];?/g) || []).length;
    if (assignmentCount > 1) {
      let first = true;
      return constructorMatch.replace(/(\s+)this\.ConnPool = source\["ConnPool"\];?/g, (match) => {
        if (first) {
          first = false;
          return match;
        }
        modified = true;
        return ''; // Remove duplicate
      });
    }
    return constructorMatch;
  });

  if (modified) {
    fs.writeFileSync(modelsPath, content, 'utf8');
    console.log('✓ Successfully fixed Wails TypeScript bindings');
  } else {
    console.log('✓ No fixes needed - bindings are already correct');
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Error fixing Wails bindings:', error.message);
  process.exit(1);
}
