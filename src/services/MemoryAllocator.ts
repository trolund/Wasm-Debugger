export class MemoryAllocator {

    // current offset
    private offset: number = 0;

    // number of pages
    private currentSize: number = 1;

    // 64kb page size
    private readonly _pageSize: number = 64 * 1024;

    // 4 bytes stride
    private readonly _stride: number = 4;

    // private grow: ((s: number) => void) | null = null;

    private _memory: WebAssembly.Memory | undefined;

    private _isDebug: boolean = true;

    // constructor
    constructor(isDebug: boolean = false) {
        this._isDebug = isDebug;
    }

    /// Allocate a new block of memory of the given size in bytes.
    /// Returns the offset of the allocated block.
    allocate(size: number): number {
    // if the offset + size is greater than the current size of the memory
    // then grow the memory by the required number of pages
    if (this.offset + size > (this.currentSize * this._pageSize)) { 
        // find required number of pages to needed
        const requiredPages = (this.offset + size) / this._pageSize;
        // round required pages to the next integer
        const roundedPages: number = (Math.ceil(requiredPages) as number);
        
        // difference between current size and the new required size
        const growBy = roundedPages - this.currentSize;

        // grow by n number of page(s)
        this._memory?.grow(growBy); // grow by n number of page(s)
        this.currentSize += growBy; // update current size

        if (this._isDebug) console.log(`MemoryAllocator: growing memory by ${growBy} pages`);
    }

    const addrees = this.offset; // save current offset
    this.offset += size; // increment offset by size

    if (this._isDebug) console.log(`MemoryAllocator: allocated ${size} bytes at offset ${addrees}`);

    return addrees; // return address
    }

    // setGrow(grow: (s: number) => void): void {
    //     this.grow = grow;
    // }

    get memory(): WebAssembly.Memory | undefined {
        return this._memory;
    }

    set memory(memory: WebAssembly.Memory | undefined) {
        this._memory = memory;
    }

    /// set the allocator to the given offset
    set(offset: number): void {
        let mul8 = (offset + 7) &(-8); // https://www.geeksforgeeks.org/round-to-next-greater-multiple-of-8/
        this.offset = mul8;
    }

    /// Reset the allocator to the beginning of the memory block
    reset(): void {
        this.offset = 0;
    }

}
