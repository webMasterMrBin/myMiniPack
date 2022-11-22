/* 
  1. 需要创建文件依赖关系图
  2. 根据 dependecy map 生成 pack.js
  结构类似 如下
   (modulesMap => {
  const require = moduleName => {
    const module = { exports: {} };
    modulesMap[moduleName](module, require);
    return module.exports;
  };

  require('../Test/index.js');
})({
  './index.js': (module, require) => {
    const foo = require('../Test/foo.js');

    console.log('执行主应用entry');

    console.log('这是require 的foo', foo);

    module.exports = foo;
  },
  './foo.js': (module, require) => {
    const foo = 'foo';

    console.log('this is foo');

    module.exports = foo;
  },
});

*/

const fs = require('fs');
const path = require('path');
const traverse = require('@babel/traverse').default;
// eslint-disable-next-line import/no-extraneous-dependencies
const {parse} = require('@babel/parser');
const generate = require('@babel/generator').default;
const {v4: uuidV4} = require('uuid');
const _ = require('lodash');

const entryFilePath = './main.js';

/** step1 创建文件的依赖关系结构 */
function createAsset({filePath, moduleType}) {
  const code = fs.readFileSync(path.join(__dirname, filePath), {
    encoding: 'utf8',
  });

  const ast = parse(code, {
    sourceType: 'module',
  });

  const dependencies = [];

  traverse(ast, {
    VariableDeclaration: astPath => {
      if (moduleType === 'cjs') {
        // 当入口文件是commonjs写法 需要解析两种格式  require('./a.js')  require('./a.js').default
        const value =
          _.get(astPath, 'node.declarations[0].init.arguments[0].value') ||
          _.get(astPath, 'node.declarations[0].init.object.arguments[0].value');
        if (value) {
          dependencies.push(value);
        }
      }
    },
    ImportDeclaration: ({node}) => {
      // es6 module
      dependencies.push(node.source.value);
    },
  });

  const newCode = generate(ast).code;

  return {
    id: filePath === entryFilePath ? 0 : uuidV4(),
    code: newCode,
    filePath,
    dependencies,
  };
}

/** step2 创建所有文件dependency map
 * {
 *  [id]: (module, require) => {fn}
 * }
 */
function createGraph(entryFile) {
  const graph = {};
  const idAndNameMap = {};
  const entryFileMap = createAsset({
    filePath: entryFile.filePath,
    moduleType: entryFile.moduleType,
  });

  const generateMap = fileInfo => {
    const { filePath, code, dependencies, id } = fileInfo;
    graph[id] = (module, require) => {
      // eslint-disable-next-line no-eval
      eval(code);
    };

    idAndNameMap[filePath] = id;

    dependencies.forEach(dependency => {
      generateMap(
        createAsset({
          filePath: dependency,
          moduleType: 'cjs',
        }),
      );
    });
  };

  generateMap(entryFileMap);

  return {
    depencyMap: graph,
    idAndNameMap,
  };
}

/** step3 根据文件依赖图生成bundle.js */
function bundle(entryFile) {
  const { depencyMap, idAndNameMap } = createGraph(entryFile);

  return ((modulesMap, idAndNameMap1) => {
    const require = moduleId => {
      const module = { exports: {} };
      const fn = modulesMap[moduleId];

      fn(module, name => require(idAndNameMap1[name]));

      return module.exports;
    };

    require(0);
  })(depencyMap, idAndNameMap);
}

// run bundle
bundle({
  filePath: entryFilePath,
  moduleType: 'cjs',
});
