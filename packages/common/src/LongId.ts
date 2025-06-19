export class LongId {
    // These are arranged like so (when seen as a BigInt written in binary):
    // 0bhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhlllllllllllllllllllllllllllllllln
    // where the h bits come from hi and the l bits come from lo.
    public lo: number;
    public hi: number;

    constructor(lo: number, hi: number) {
        this.lo = lo >>> 0;
        this.hi = hi >>> 0;
    }

    public increment(): void {
        const lo: number = this.lo;
        const lowBitsOverflowed: boolean = lo === 4294967295;
        this.lo = (lo + 1) >>> 0;
        if (lowBitsOverflowed) {
            this.hi = (this.hi + 1) >>> 0;
        }
    }

    public toBigInt(): BigInt {
        return (BigInt(this.hi) << 32n) + BigInt(this.lo);
    }

    public toString(): string {
        return this.toBigInt().toString();
    }
}
