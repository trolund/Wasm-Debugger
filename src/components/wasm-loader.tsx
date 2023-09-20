import { useEffect, useState } from "react";
import styles from './wasm-loader.module.css';
import { useFilePicker } from 'use-file-picker';
import { FiFileText, FiChevronRight, FiRefreshCcw } from "react-icons/fi";
import { WASI, init, MemFS } from "@wasmer/wasi";
import { Buffer } from 'buffer';
import { lowerI64Imports } from "@wasmer/wasm-transformer"
import { MemoryAllocator } from "../services/MemoryAllocator";
import { getImports } from "../services/ImportService";

// @ts-ignore
window.Buffer = Buffer;

type exportValue = {
  kind: string;
  name: string;
}

export const WasmLoader = () => {

  const [msg, setMsg] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [wasmResult, setWasmResult] = useState<number | null>(null);
  const [wasmModule, setWasmInstance] = useState<WebAssembly.Module | null>(null);
  const [isRunDisabled, setIsRunDisabled] = useState(true);
  const [stdout, setStdout] = useState("");

  let isInitialized = false;

  // on mount
  useEffect(() => {
    if (isInitialized) {
      return;
    }
    init().then(() => {
      console.log("🚀 WASI initialized");
      isInitialized = true;
    })

    return () => {
      isInitialized = false;
    }
  }, []);

  const [openFileSelector, { loading }] = useFilePicker({
    accept: ['.wasm'],
    readAs: "ArrayBuffer",
    multiple: false,
    limitFilesConfig: { max: 1 },
    onFilesSelected: async (file) => {
      setWasmResult(null);
      setStdout("");
      setIsRunDisabled(false);
      // get the first and only file
      const wasmFile = file.filesContent[0];
      // get the bytes
      const bytes = wasmFile.content;

      const loweredWasmBytes = await lowerI64Imports(bytes)

      // instantiate the wasm module
      const module: WebAssembly.Module = await WebAssembly.compile(loweredWasmBytes);
      setWasmInstance(module);

      const exports = WebAssembly.Module.exports(module);

      const heapBase = exports.find((e: exportValue) => e.name == "heap_base_ptr" ? true : false);
      const haveEntryPoint = exports.find((e: exportValue) => (e.name == "_start" && e.kind == "function") ? true : false);

      if (haveEntryPoint) {
        console.log("Found _start function");
        setIsRunDisabled(false);
      } else {
        console.log("No _start function found");
        setMsg("No _start function found ❌");
        setIsRunDisabled(true);
      }
    },
    onFilesRejected: ({ errors }) => {
      // this callback is called when there were validation errors
      console.log('File rejected', errors);
      setMsg("File rejected: " + errors);
      setIsRunDisabled(true);
    },
    onFilesSuccessfulySelected: ({ plainFiles, filesContent }) => {
      // this callback is called when there were no validation errors
      console.log('File selected', plainFiles[0].name);
      setMsg("File selected: " + plainFiles[0].name + " ✅");
      setIsRunDisabled(false);
    },
  });

  // let memory: WebAssembly.Memory = new WebAssembly.Memory({ initial: 1 });

  

  const run = async () => {
    console.log("🏃‍♂️ Running...");


    const memoryAllocator = new MemoryAllocator();
    const fs = new MemFS()

    let wasi = new WASI({
      env: {},
      args: [],
      fs: fs,
      preopens: {
        "/": "/",
      }
    });

    setIsRunning(true);

    if (!wasmModule) {
      console.log("No wasm module found");
      return;
    }

    let wasiImports = {};
    let wasiUsed = false;

    try {
      wasiImports = wasi.getImports(wasmModule);
      wasiUsed = true;
    } catch (e) {
      console.log("WASI not used.")
    }

    const combinedImports = {
      ...wasiImports, // WASI imports
      ...getImports(memoryAllocator) // Other "custom" imports
    };

    const instance = await WebAssembly.instantiate(wasmModule, combinedImports);

    // Grow the memory function

    let growMemory = (n: number) => {
      (instance.exports.memory as WebAssembly.Memory).grow(n);
    }

    let heap_base: number;

    try {
      heap_base = (instance.exports.heap_base_ptr as any).value as number;
    } catch (e) {
      console.log("No heap_base_ptr found");
      heap_base = 0;
    }

    // initialize the memory allocator
    memoryAllocator.set(heap_base);
    memoryAllocator.memory = (instance.exports.memory as WebAssembly.Memory);
    memoryAllocator.setGrow(growMemory);

    if (wasiUsed) {

      // Start the WebAssembly WASI instance!
      try {
        // Run the start function
        let exitCode = wasi.start(instance);
        // Get the stdout of the WASI module
        let stdout = wasi.getStdoutString();

        setStdout(stdout);

        // This should print "hello world (exit code: 0)"
        console.log(`${stdout}(exit code: ${exitCode})`);
        setWasmResult(exitCode);
      } catch (e) {
        console.error(e);
      } finally {
        setIsRunning(false);
        wasi.free();
      }

    } else {
      const start = instance.exports._start as () => number;
      const exitCode = start();
      console.log(`${stdout}(exit code: ${exitCode})`);
      setWasmResult(exitCode);
      setIsRunning(false);
    }
  }

  const reloadPage = () => {
    window.location.reload();
  }

  const status = (result: number) => {
    if (result == 0) {
      return <div>exit code: {result}, Success✅</div>
    }
    else if (result == -1) {
      return <></>
    }

    return <div>exit code: {result}, Failure❌</div>
  }

  return (
    <>
      <button className={styles.button} onClick={reloadPage}><FiRefreshCcw className={styles.icon} />Reset</button>
      {loading && <div>⏳Loading...</div>}
      {isRunning && <div>🏃‍♂️Running...</div>}
      <div>
        <button className={styles.button} onClick={openFileSelector}><FiFileText className={styles.icon} /> Select file</button>
        <button disabled={isRunDisabled} className={styles.button} onClick={run}><FiChevronRight className={styles.icon} /> Run</button>
      </div>
      <div>
        <div>{msg}</div>
      </div>
      {status(wasmResult ?? -1)}
      {stdout && <div className={styles.stdout}>
        <div>Stdout:</div>
        <div>{stdout}</div>
      </div>}
      <footer className={styles.footer}>
        <div>Created by Troels Lund (trolund@gmail.com)</div>
      </footer>
    </>
  );
};


