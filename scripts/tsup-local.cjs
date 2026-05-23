const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const esbuild = require('esbuild');

function unwrapConfig(mod) {
  const resolved = mod && mod.default ? mod.default : mod;
  return Array.isArray(resolved) ? resolved[0] : resolved;
}

function loadConfig(cwd) {
  const jsConfigPath = path.join(cwd, 'tsup.config.js');
  const tsConfigPath = path.join(cwd, 'tsup.config.ts');

  if (fs.existsSync(tsConfigPath)) {
    const source = fs.readFileSync(tsConfigPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: tsConfigPath,
    }).outputText;

    const configModule = new Module(tsConfigPath, module);
    configModule.filename = tsConfigPath;
    configModule.paths = Module._nodeModulePaths(path.dirname(tsConfigPath));
    configModule._compile(transpiled, tsConfigPath);
    return unwrapConfig(configModule.exports);
  }

  if (fs.existsSync(jsConfigPath)) {
    return unwrapConfig(require(jsConfigPath));
  }

  return {};
}

function formatDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  };

  return ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
}

function emitDeclarations(cwd, outDir) {
  const configPath = path.join(cwd, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    process.stderr.write(formatDiagnostics([configFile.error]));
    throw new Error('Failed to read tsconfig.json');
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    cwd,
    {
      noEmit: false,
      emitDeclarationOnly: true,
      declaration: true,
      declarationMap: true,
      outDir,
    },
    configPath
  );

  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const emitResult = program.emit(undefined, undefined, undefined, true);
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    process.stderr.write(formatDiagnostics(diagnostics));
  }

  const hasErrors = diagnostics.some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );

  if (hasErrors || emitResult.emitSkipped) {
    throw new Error('Declaration build failed');
  }
}

async function run() {
  const cwd = process.cwd();
  const config = loadConfig(cwd) ?? {};
  const entryPoints = Array.isArray(config.entry)
    ? config.entry
    : [config.entry ?? 'src/index.ts'];
  const formats = Array.isArray(config.format)
    ? config.format
    : [config.format ?? 'esm'];
  const outDir = path.resolve(cwd, config.outDir ?? 'dist');

  if (config.clean) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  for (const format of formats) {
    await esbuild.build({
      entryPoints: entryPoints.map((entryPoint) => path.resolve(cwd, entryPoint)),
      outdir: outDir,
      bundle: true,
      format,
      platform: config.platform ?? 'neutral',
      target: config.target ?? 'es2020',
      sourcemap: Boolean(config.sourcemap),
      splitting: Boolean(config.splitting) && format === 'esm',
      minify: Boolean(config.minify),
      treeShaking: config.treeshake === false ? false : true,
      tsconfig: path.resolve(cwd, 'tsconfig.json'),
      outExtension: format === 'cjs' ? { '.js': '.cjs' } : undefined,
      logLevel: 'info',
    });
  }

  if (config.dts) {
    emitDeclarations(cwd, outDir);
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
