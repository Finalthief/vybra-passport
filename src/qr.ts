import { buildCollectiveAgentUrl } from './surfaces';

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type QrModuleShape = 'square' | 'rounded' | 'circle';
export type QrEyeStyle = 'square' | 'rounded' | 'circle';

export type QrFill =
  | {
      type?: 'solid';
      color: string;
    }
  | {
      type: 'linear-gradient';
      from: string;
      to: string;
      rotation?: number;
    };

export interface QrSvgOptions {
  size?: number;
  margin?: number;
  backgroundColor?: string;
  fill?: QrFill;
  eyeFill?: QrFill;
  moduleShape?: QrModuleShape;
  eyeStyle?: QrEyeStyle;
  errorCorrection?: QrErrorCorrectionLevel;
  title?: string;
  description?: string;
}

interface QrRsBlock {
  totalCount: number;
  dataCount: number;
}

interface Paint {
  defs: string;
  fill: string;
}

interface ByteData {
  bytes: number[];
}

const MODE_8BIT_BYTE = 1 << 2;
const PAD0 = 0xec;
const PAD1 = 0x11;

const ERROR_CORRECTION_LEVEL_VALUE: Record<QrErrorCorrectionLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

const PATTERN_POSITION_TABLE: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

const RS_BLOCK_TABLE: number[][] = [
  [1, 26, 19],
  [1, 26, 16],
  [1, 26, 13],
  [1, 26, 9],
  [1, 44, 34],
  [1, 44, 28],
  [1, 44, 22],
  [1, 44, 16],
  [1, 70, 55],
  [1, 70, 44],
  [2, 35, 17],
  [2, 35, 13],
  [1, 100, 80],
  [2, 50, 32],
  [2, 50, 24],
  [4, 25, 9],
  [1, 134, 108],
  [2, 67, 43],
  [2, 33, 15, 2, 34, 16],
  [2, 33, 11, 2, 34, 12],
  [2, 86, 68],
  [4, 43, 27],
  [4, 43, 19],
  [4, 43, 15],
  [2, 98, 78],
  [4, 49, 31],
  [2, 32, 14, 4, 33, 15],
  [4, 39, 13, 1, 40, 14],
  [2, 121, 97],
  [2, 60, 38, 2, 61, 39],
  [4, 40, 18, 2, 41, 19],
  [4, 40, 14, 2, 41, 15],
  [2, 146, 116],
  [3, 58, 36, 2, 59, 37],
  [4, 36, 16, 4, 37, 17],
  [4, 36, 12, 4, 37, 13],
  [2, 86, 68, 2, 87, 69],
  [4, 69, 43, 1, 70, 44],
  [6, 43, 19, 2, 44, 20],
  [6, 43, 15, 2, 44, 16],
  [4, 101, 81],
  [1, 80, 50, 4, 81, 51],
  [4, 50, 22, 4, 51, 23],
  [3, 36, 12, 8, 37, 13],
  [2, 116, 92, 2, 117, 93],
  [6, 58, 36, 2, 59, 37],
  [4, 46, 20, 6, 47, 21],
  [7, 42, 14, 4, 43, 15],
  [4, 133, 107],
  [8, 59, 37, 1, 60, 38],
  [8, 44, 20, 4, 45, 21],
  [12, 33, 11, 4, 34, 12],
  [3, 145, 115, 1, 146, 116],
  [4, 64, 40, 5, 65, 41],
  [11, 36, 16, 5, 37, 17],
  [11, 36, 12, 5, 37, 13],
  [5, 109, 87, 1, 110, 88],
  [5, 65, 41, 5, 66, 42],
  [5, 54, 24, 7, 55, 25],
  [11, 36, 12],
  [5, 122, 98, 1, 123, 99],
  [7, 73, 45, 3, 74, 46],
  [15, 43, 19, 2, 44, 20],
  [3, 45, 15, 13, 46, 16],
  [1, 135, 107, 5, 136, 108],
  [10, 74, 46, 1, 75, 47],
  [1, 50, 22, 15, 51, 23],
  [2, 42, 14, 17, 43, 15],
  [5, 150, 120, 1, 151, 121],
  [9, 69, 43, 4, 70, 44],
  [17, 50, 22, 1, 51, 23],
  [2, 42, 14, 19, 43, 15],
  [3, 141, 113, 4, 142, 114],
  [3, 70, 44, 11, 71, 45],
  [17, 47, 21, 4, 48, 22],
  [9, 39, 13, 16, 40, 14],
  [3, 135, 107, 5, 136, 108],
  [3, 67, 41, 13, 68, 42],
  [15, 54, 24, 5, 55, 25],
  [15, 43, 15, 10, 44, 16],
  [4, 144, 116, 4, 145, 117],
  [17, 68, 42],
  [17, 50, 22, 6, 51, 23],
  [19, 46, 16, 6, 47, 17],
  [2, 139, 111, 7, 140, 112],
  [17, 74, 46],
  [7, 54, 24, 16, 55, 25],
  [34, 37, 13],
  [4, 151, 121, 5, 152, 122],
  [4, 75, 47, 14, 76, 48],
  [11, 54, 24, 14, 55, 25],
  [16, 45, 15, 14, 46, 16],
  [6, 147, 117, 4, 148, 118],
  [6, 73, 45, 14, 74, 46],
  [11, 54, 24, 16, 55, 25],
  [30, 46, 16, 2, 47, 17],
  [8, 132, 106, 4, 133, 107],
  [8, 75, 47, 13, 76, 48],
  [7, 54, 24, 22, 55, 25],
  [22, 45, 15, 13, 46, 16],
  [10, 142, 114, 2, 143, 115],
  [19, 74, 46, 4, 75, 47],
  [28, 50, 22, 6, 51, 23],
  [33, 46, 16, 4, 47, 17],
  [8, 152, 122, 4, 153, 123],
  [22, 73, 45, 3, 74, 46],
  [8, 53, 23, 26, 54, 24],
  [12, 45, 15, 28, 46, 16],
  [3, 147, 117, 10, 148, 118],
  [3, 73, 45, 23, 74, 46],
  [4, 54, 24, 31, 55, 25],
  [11, 45, 15, 31, 46, 16],
  [7, 146, 116, 7, 147, 117],
  [21, 73, 45, 7, 74, 46],
  [1, 53, 23, 37, 54, 24],
  [19, 45, 15, 26, 46, 16],
  [5, 145, 115, 10, 146, 116],
  [19, 75, 47, 10, 76, 48],
  [15, 54, 24, 25, 55, 25],
  [23, 45, 15, 25, 46, 16],
  [13, 145, 115, 3, 146, 116],
  [2, 74, 46, 29, 75, 47],
  [42, 54, 24, 1, 55, 25],
  [23, 45, 15, 28, 46, 16],
  [17, 145, 115],
  [10, 74, 46, 23, 75, 47],
  [10, 54, 24, 35, 55, 25],
  [19, 45, 15, 35, 46, 16],
  [17, 145, 115, 1, 146, 116],
  [14, 74, 46, 21, 75, 47],
  [29, 54, 24, 19, 55, 25],
  [11, 45, 15, 46, 46, 16],
  [13, 145, 115, 6, 146, 116],
  [14, 74, 46, 23, 75, 47],
  [44, 54, 24, 7, 55, 25],
  [59, 46, 16, 1, 47, 17],
  [12, 151, 121, 7, 152, 122],
  [12, 75, 47, 26, 76, 48],
  [39, 54, 24, 14, 55, 25],
  [22, 45, 15, 41, 46, 16],
  [6, 151, 121, 14, 152, 122],
  [6, 75, 47, 34, 76, 48],
  [46, 54, 24, 10, 55, 25],
  [2, 45, 15, 64, 46, 16],
  [17, 152, 122, 4, 153, 123],
  [29, 74, 46, 14, 75, 47],
  [49, 54, 24, 10, 55, 25],
  [24, 45, 15, 46, 46, 16],
  [4, 152, 122, 18, 153, 123],
  [13, 74, 46, 32, 75, 47],
  [48, 54, 24, 14, 55, 25],
  [42, 45, 15, 32, 46, 16],
  [20, 147, 117, 4, 148, 118],
  [40, 75, 47, 7, 76, 48],
  [43, 54, 24, 22, 55, 25],
  [10, 45, 15, 67, 46, 16],
  [19, 148, 118, 6, 149, 119],
  [18, 75, 47, 31, 76, 48],
  [34, 54, 24, 34, 55, 25],
  [20, 45, 15, 61, 46, 16],
];

const EXP_TABLE = new Uint16Array(256);
const LOG_TABLE = new Uint16Array(256);

for (let index = 0; index < 8; index += 1) {
  EXP_TABLE[index] = 1 << index;
}

for (let index = 8; index < 256; index += 1) {
  EXP_TABLE[index] =
    EXP_TABLE[index - 4]! ^
    EXP_TABLE[index - 5]! ^
    EXP_TABLE[index - 6]! ^
    EXP_TABLE[index - 8]!;
}

for (let index = 0; index < 255; index += 1) {
  LOG_TABLE[EXP_TABLE[index]!] = index;
}

class BitBuffer {
  readonly bytes: number[] = [];
  bitLength = 0;

  put(value: number, length: number): void {
    for (let index = 0; index < length; index += 1) {
      this.putBit(((value >>> (length - index - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean): void {
    const bufferIndex = Math.floor(this.bitLength / 8);
    if (this.bytes.length <= bufferIndex) {
      this.bytes.push(0);
    }

    if (bit) {
      this.bytes[bufferIndex]! |= 0x80 >>> (this.bitLength % 8);
    }

    this.bitLength += 1;
  }
}

class Polynomial {
  readonly coefficients: number[];

  constructor(values: number[], shift: number) {
    let offset = 0;
    while (offset < values.length && values[offset] === 0) {
      offset += 1;
    }

    this.coefficients = values.slice(offset);
    for (let index = 0; index < shift; index += 1) {
      this.coefficients.push(0);
    }
  }

  get length(): number {
    return this.coefficients.length;
  }

  get(index: number): number {
    return this.coefficients[index] ?? 0;
  }

  multiply(other: Polynomial): Polynomial {
    const output = new Array(this.length + other.length - 1).fill(0);

    for (let leftIndex = 0; leftIndex < this.length; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < other.length; rightIndex += 1) {
        output[leftIndex + rightIndex] ^=
          gexp(glog(this.get(leftIndex)) + glog(other.get(rightIndex)));
      }
    }

    return new Polynomial(output, 0);
  }

  mod(other: Polynomial): Polynomial {
    if (this.length - other.length < 0) {
      return this;
    }

    const output = [...this.coefficients];
    while (output.length - other.length >= 0) {
      const ratio = glog(output[0] ?? 0) - glog(other.get(0));
      for (let index = 0; index < other.length; index += 1) {
        output[index]! ^= gexp(glog(other.get(index)) + ratio);
      }

      while (output.length > 0 && output[0] === 0) {
        output.shift();
      }
    }

    return new Polynomial(output, 0);
  }
}

function glog(value: number): number {
  if (value < 1) {
    throw new Error(`glog(${value})`);
  }

  return LOG_TABLE[value] ?? 0;
}

function gexp(value: number): number {
  let current = value;
  while (current < 0) {
    current += 255;
  }
  while (current >= 256) {
    current -= 255;
  }
  return EXP_TABLE[current] ?? 0;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toByteData(value: string): ByteData {
  return {
    bytes: Array.from(new TextEncoder().encode(value)),
  };
}

function getLengthInBits(version: number): number {
  if (version >= 1 && version < 10) {
    return 8;
  }
  if (version < 41) {
    return 16;
  }
  throw new Error(`Unsupported QR version: ${version}`);
}

function getRsBlocks(version: number, errorCorrection: QrErrorCorrectionLevel): QrRsBlock[] {
  const levelOffset = { L: 0, M: 1, Q: 2, H: 3 }[errorCorrection];
  const entry = RS_BLOCK_TABLE[(version - 1) * 4 + levelOffset];
  if (!entry) {
    throw new Error(`Unsupported QR RS block entry for version ${version}/${errorCorrection}`);
  }

  const blocks: QrRsBlock[] = [];
  for (let index = 0; index < entry.length; index += 3) {
    const count = entry[index] ?? 0;
    const totalCount = entry[index + 1] ?? 0;
    const dataCount = entry[index + 2] ?? 0;
    for (let repeat = 0; repeat < count; repeat += 1) {
      blocks.push({ totalCount, dataCount });
    }
  }

  return blocks;
}

function getTotalDataCount(version: number, errorCorrection: QrErrorCorrectionLevel): number {
  return getRsBlocks(version, errorCorrection).reduce((sum, block) => sum + block.dataCount, 0);
}

function getBchDigit(data: number): number {
  let digit = 0;
  let current = data;
  while (current !== 0) {
    digit += 1;
    current >>>= 1;
  }
  return digit;
}

function getBchTypeInfo(data: number): number {
  const g15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  const g15Mask = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
  let current = data << 10;
  while (getBchDigit(current) - getBchDigit(g15) >= 0) {
    current ^= g15 << (getBchDigit(current) - getBchDigit(g15));
  }
  return ((data << 10) | current) ^ g15Mask;
}

function getBchTypeNumber(data: number): number {
  const g18 =
    (1 << 12) |
    (1 << 11) |
    (1 << 10) |
    (1 << 9) |
    (1 << 8) |
    (1 << 5) |
    (1 << 2) |
    (1 << 0);
  let current = data << 12;
  while (getBchDigit(current) - getBchDigit(g18) >= 0) {
    current ^= g18 << (getBchDigit(current) - getBchDigit(g18));
  }
  return (data << 12) | current;
}

function getPatternPositions(version: number): number[] {
  const positions = PATTERN_POSITION_TABLE[version - 1];
  if (!positions) {
    throw new Error(`Unsupported QR version: ${version}`);
  }
  return positions;
}

function getMask(maskPattern: number, row: number, col: number): boolean {
  switch (maskPattern) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return ((((row * col) % 2) + ((row * col) % 3)) % 2) === 0;
    case 7:
      return ((((row * col) % 3) + ((row + col) % 2)) % 2) === 0;
    default:
      throw new Error(`Unsupported QR mask pattern: ${maskPattern}`);
  }
}

function getErrorCorrectPolynomial(errorCorrectLength: number): Polynomial {
  let polynomial = new Polynomial([1], 0);
  for (let index = 0; index < errorCorrectLength; index += 1) {
    polynomial = polynomial.multiply(new Polynomial([1, gexp(index)], 0));
  }
  return polynomial;
}

function createBytes(buffer: BitBuffer, rsBlocks: QrRsBlock[]): number[] {
  let offset = 0;
  let maxDataCount = 0;
  let maxErrorCount = 0;
  const dataBlocks: number[][] = [];
  const errorBlocks: number[][] = [];

  for (const block of rsBlocks) {
    const dataCount = block.dataCount;
    const errorCount = block.totalCount - dataCount;
    maxDataCount = Math.max(maxDataCount, dataCount);
    maxErrorCount = Math.max(maxErrorCount, errorCount);

    const blockData = buffer.bytes.slice(offset, offset + dataCount);
    offset += dataCount;
    dataBlocks.push(blockData);

    const rsPolynomial = getErrorCorrectPolynomial(errorCount);
    const rawPolynomial = new Polynomial(blockData, rsPolynomial.length - 1);
    const modPolynomial = rawPolynomial.mod(rsPolynomial);
    const errorData = new Array(rsPolynomial.length - 1).fill(0);

    for (let index = 0; index < errorData.length; index += 1) {
      const modIndex = index + modPolynomial.length - errorData.length;
      errorData[index] = modIndex >= 0 ? modPolynomial.get(modIndex) : 0;
    }

    errorBlocks.push(errorData);
  }

  const output: number[] = [];
  for (let index = 0; index < maxDataCount; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        output.push(block[index] ?? 0);
      }
    }
  }

  for (let index = 0; index < maxErrorCount; index += 1) {
    for (const block of errorBlocks) {
      if (index < block.length) {
        output.push(block[index] ?? 0);
      }
    }
  }

  return output;
}

function createData(version: number, errorCorrection: QrErrorCorrectionLevel, data: ByteData): number[] {
  const rsBlocks = getRsBlocks(version, errorCorrection);
  const buffer = new BitBuffer();
  buffer.put(MODE_8BIT_BYTE, 4);
  buffer.put(data.bytes.length, getLengthInBits(version));

  for (const byte of data.bytes) {
    buffer.put(byte, 8);
  }

  const totalDataCount = rsBlocks.reduce((sum, block) => sum + block.dataCount, 0);
  if (buffer.bitLength > totalDataCount * 8) {
    throw new Error(`QR code length overflow (${buffer.bitLength} > ${totalDataCount * 8}).`);
  }

  if (buffer.bitLength + 4 <= totalDataCount * 8) {
    buffer.put(0, 4);
  }

  while (buffer.bitLength % 8 !== 0) {
    buffer.putBit(false);
  }

  while (buffer.bitLength < totalDataCount * 8) {
    buffer.put(PAD0, 8);
    if (buffer.bitLength < totalDataCount * 8) {
      buffer.put(PAD1, 8);
    }
  }

  return createBytes(buffer, rsBlocks);
}

function resolveVersion(data: ByteData, errorCorrection: QrErrorCorrectionLevel): number {
  for (let version = 1; version <= 40; version += 1) {
    const requiredBits = 4 + getLengthInBits(version) + data.bytes.length * 8;
    const capacityBits = getTotalDataCount(version, errorCorrection) * 8;
    if (requiredBits <= capacityBits) {
      return version;
    }
  }

  throw new Error('QR code payload is too large to encode.');
}

function createEmptyMatrix(version: number): Array<Array<boolean | null>> {
  const moduleCount = version * 4 + 17;
  return Array.from({ length: moduleCount }, () => Array<boolean | null>(moduleCount).fill(null));
}

function setupPositionProbePattern(
  matrix: Array<Array<boolean | null>>,
  row: number,
  col: number
): void {
  const moduleCount = matrix.length;

  for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
    if (row + rowOffset < 0 || row + rowOffset >= moduleCount) {
      continue;
    }

    for (let colOffset = -1; colOffset <= 7; colOffset += 1) {
      if (col + colOffset < 0 || col + colOffset >= moduleCount) {
        continue;
      }

      if (
        (rowOffset >= 0 && rowOffset <= 6 && (colOffset === 0 || colOffset === 6)) ||
        (colOffset >= 0 && colOffset <= 6 && (rowOffset === 0 || rowOffset === 6)) ||
        (rowOffset >= 2 && rowOffset <= 4 && colOffset >= 2 && colOffset <= 4)
      ) {
        matrix[row + rowOffset]![col + colOffset] = true;
      } else {
        matrix[row + rowOffset]![col + colOffset] = false;
      }
    }
  }
}

function setupPositionAdjustPattern(matrix: Array<Array<boolean | null>>, version: number): void {
  const positions = getPatternPositions(version);

  for (const row of positions) {
    for (const col of positions) {
      if (matrix[row]![col] !== null) {
        continue;
      }

      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
          matrix[row + rowOffset]![col + colOffset] =
            Math.abs(rowOffset) === 2 ||
            Math.abs(colOffset) === 2 ||
            (rowOffset === 0 && colOffset === 0);
        }
      }
    }
  }
}

function setupTimingPattern(matrix: Array<Array<boolean | null>>): void {
  const moduleCount = matrix.length;

  for (let row = 8; row < moduleCount - 8; row += 1) {
    if (matrix[row]![6] === null) {
      matrix[row]![6] = row % 2 === 0;
    }
  }

  for (let col = 8; col < moduleCount - 8; col += 1) {
    if (matrix[6]![col] === null) {
      matrix[6]![col] = col % 2 === 0;
    }
  }
}

function setupTypeNumber(
  matrix: Array<Array<boolean | null>>,
  version: number,
  test: boolean
): void {
  const bits = getBchTypeNumber(version);
  const moduleCount = matrix.length;

  for (let index = 0; index < 18; index += 1) {
    const value = !test && ((bits >> index) & 1) === 1;
    matrix[Math.floor(index / 3)]![index % 3 + moduleCount - 11] = value;
    matrix[index % 3 + moduleCount - 11]![Math.floor(index / 3)] = value;
  }
}

function setupTypeInfo(
  matrix: Array<Array<boolean | null>>,
  errorCorrection: QrErrorCorrectionLevel,
  maskPattern: number,
  test: boolean
): void {
  const data = (ERROR_CORRECTION_LEVEL_VALUE[errorCorrection] << 3) | maskPattern;
  const bits = getBchTypeInfo(data);
  const moduleCount = matrix.length;

  for (let index = 0; index < 15; index += 1) {
    const value = !test && ((bits >> index) & 1) === 1;
    if (index < 6) {
      matrix[index]![8] = value;
    } else if (index < 8) {
      matrix[index + 1]![8] = value;
    } else {
      matrix[moduleCount - 15 + index]![8] = value;
    }
  }

  for (let index = 0; index < 15; index += 1) {
    const value = !test && ((bits >> index) & 1) === 1;
    if (index < 8) {
      matrix[8]![moduleCount - index - 1] = value;
    } else if (index < 9) {
      matrix[8]![15 - index] = value;
    } else {
      matrix[8]![15 - index - 1] = value;
    }
  }

  matrix[moduleCount - 8]![8] = !test;
}

function mapData(
  matrix: Array<Array<boolean | null>>,
  data: number[],
  maskPattern: number
): void {
  const moduleCount = matrix.length;
  let direction = -1;
  let row = moduleCount - 1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let col = moduleCount - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1;
    }

    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetCol = col - offset;
        if (matrix[row]![targetCol] !== null) {
          continue;
        }

        let dark = false;
        if (byteIndex < data.length) {
          dark = (((data[byteIndex] ?? 0) >>> bitIndex) & 1) === 1;
        }

        if (getMask(maskPattern, row, targetCol)) {
          dark = !dark;
        }

        matrix[row]![targetCol] = dark;
        bitIndex -= 1;
        if (bitIndex === -1) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }

      row += direction;
      if (row < 0 || row >= moduleCount) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

function finalizeMatrix(matrix: Array<Array<boolean | null>>): boolean[][] {
  return matrix.map((row) => row.map((value) => Boolean(value)));
}

function getLostPoint(matrix: boolean[][]): number {
  const moduleCount = matrix.length;
  let lostPoint = 0;

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      let sameCount = 0;
      const dark = matrix[row]![col]!;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        if (row + rowOffset < 0 || row + rowOffset >= moduleCount) {
          continue;
        }

        for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
          if (col + colOffset < 0 || col + colOffset >= moduleCount) {
            continue;
          }
          if (rowOffset === 0 && colOffset === 0) {
            continue;
          }
          if (dark === matrix[row + rowOffset]![col + colOffset]!) {
            sameCount += 1;
          }
        }
      }

      if (sameCount > 5) {
        lostPoint += 3 + sameCount - 5;
      }
    }
  }

  for (let row = 0; row < moduleCount - 1; row += 1) {
    for (let col = 0; col < moduleCount - 1; col += 1) {
      let count = 0;
      if (matrix[row]![col]!) count += 1;
      if (matrix[row + 1]![col]!) count += 1;
      if (matrix[row]![col + 1]!) count += 1;
      if (matrix[row + 1]![col + 1]!) count += 1;
      if (count === 0 || count === 4) {
        lostPoint += 3;
      }
    }
  }

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount - 6; col += 1) {
      if (
        matrix[row]![col] &&
        !matrix[row]![col + 1] &&
        matrix[row]![col + 2] &&
        matrix[row]![col + 3] &&
        matrix[row]![col + 4] &&
        !matrix[row]![col + 5] &&
        matrix[row]![col + 6]
      ) {
        lostPoint += 40;
      }
    }
  }

  for (let col = 0; col < moduleCount; col += 1) {
    for (let row = 0; row < moduleCount - 6; row += 1) {
      if (
        matrix[row]![col] &&
        !matrix[row + 1]![col] &&
        matrix[row + 2]![col] &&
        matrix[row + 3]![col] &&
        matrix[row + 4]![col] &&
        !matrix[row + 5]![col] &&
        matrix[row + 6]![col]
      ) {
        lostPoint += 40;
      }
    }
  }

  let darkCount = 0;
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (matrix[row]![col]) {
        darkCount += 1;
      }
    }
  }

  const ratio = Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5;
  lostPoint += ratio * 10;
  return lostPoint;
}

function buildMatrix(value: string, errorCorrection: QrErrorCorrectionLevel): boolean[][] {
  const data = toByteData(value);
  const version = resolveVersion(data, errorCorrection);
  const dataBytes = createData(version, errorCorrection, data);
  let bestMaskPattern = 0;
  let bestLostPoint = Number.POSITIVE_INFINITY;

  for (let maskPattern = 0; maskPattern < 8; maskPattern += 1) {
    const testMatrix = createEmptyMatrix(version);
    const moduleCount = testMatrix.length;
    setupPositionProbePattern(testMatrix, 0, 0);
    setupPositionProbePattern(testMatrix, moduleCount - 7, 0);
    setupPositionProbePattern(testMatrix, 0, moduleCount - 7);
    setupPositionAdjustPattern(testMatrix, version);
    setupTimingPattern(testMatrix);
    setupTypeInfo(testMatrix, errorCorrection, maskPattern, true);
    if (version >= 7) {
      setupTypeNumber(testMatrix, version, true);
    }
    mapData(testMatrix, dataBytes, maskPattern);

    const finalized = finalizeMatrix(testMatrix);
    const lostPoint = getLostPoint(finalized);
    if (lostPoint < bestLostPoint) {
      bestLostPoint = lostPoint;
      bestMaskPattern = maskPattern;
    }
  }

  const finalMatrix = createEmptyMatrix(version);
  const moduleCount = finalMatrix.length;
  setupPositionProbePattern(finalMatrix, 0, 0);
  setupPositionProbePattern(finalMatrix, moduleCount - 7, 0);
  setupPositionProbePattern(finalMatrix, 0, moduleCount - 7);
  setupPositionAdjustPattern(finalMatrix, version);
  setupTimingPattern(finalMatrix);
  setupTypeInfo(finalMatrix, errorCorrection, bestMaskPattern, false);
  if (version >= 7) {
    setupTypeNumber(finalMatrix, version, false);
  }
  mapData(finalMatrix, dataBytes, bestMaskPattern);
  return finalizeMatrix(finalMatrix);
}

function isFinderModule(row: number, col: number, moduleCount: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= moduleCount - 7;
  const inBottomLeft = row >= moduleCount - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function renderShape(
  shape: QrModuleShape | QrEyeStyle,
  x: number,
  y: number,
  size: number,
  fill: string
): string {
  const safeFill = escapeXml(fill);
  if (shape === 'circle') {
    return `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="${safeFill}" />`;
  }

  const rx = shape === 'rounded' ? Math.min(size * 0.28, size / 2) : 0;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="${safeFill}" />`;
}

function createPaint(fill: QrFill, id: string): Paint {
  if (fill.type === 'linear-gradient') {
    const rotation = fill.rotation ?? 45;
    const radians = (rotation * Math.PI) / 180;
    const x = Math.cos(radians) * 0.5;
    const y = Math.sin(radians) * 0.5;
    const x1 = (0.5 - x).toFixed(3);
    const y1 = (0.5 - y).toFixed(3);
    const x2 = (0.5 + x).toFixed(3);
    const y2 = (0.5 + y).toFixed(3);

    return {
      fill: `url(#${id})`,
      defs: `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
  <stop offset="0%" stop-color="${escapeXml(fill.from)}" />
  <stop offset="100%" stop-color="${escapeXml(fill.to)}" />
</linearGradient>`,
    };
  }

  return {
    fill: fill.color,
    defs: '',
  };
}

function renderEye(
  eyeStyle: QrEyeStyle,
  x: number,
  y: number,
  darkFill: string,
  lightFill: string
): string {
  return [
    renderShape(eyeStyle, x, y, 7, darkFill),
    renderShape(eyeStyle, x + 1, y + 1, 5, lightFill),
    renderShape(eyeStyle, x + 2, y + 2, 3, darkFill),
  ].join('');
}

function resolveGenerateArgs(
  baseUrlOrOptions?: string | QrSvgOptions,
  options: QrSvgOptions = {}
): { baseUrl: string | undefined; options: QrSvgOptions } {
  if (typeof baseUrlOrOptions === 'string') {
    return { baseUrl: baseUrlOrOptions, options };
  }

  return { baseUrl: undefined, options: baseUrlOrOptions ?? {} };
}

export function generateQrCodeSvg(value: string, options: QrSvgOptions = {}): string {
  const matrix = buildMatrix(value, options.errorCorrection ?? 'M');
  const moduleCount = matrix.length;
  const size = options.size ?? 256;
  const margin = Math.max(0, options.margin ?? 4);
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const moduleShape = options.moduleShape ?? 'square';
  const eyeStyle = options.eyeStyle ?? 'rounded';
  const moduleFill = options.fill ?? { color: '#0f172a' };
  const eyeFill = options.eyeFill ?? moduleFill;
  const idSeed = fnv1a(
    `${value}|${JSON.stringify({
      moduleFill,
      eyeFill,
      moduleShape,
      eyeStyle,
      backgroundColor,
    })}`
  ).toString(16);
  const modulePaint = createPaint(moduleFill, `qr-fill-${idSeed}`);
  const eyePaint = createPaint(eyeFill, `qr-eye-fill-${idSeed}`);
  const viewBoxSize = moduleCount + margin * 2;
  const defs = [modulePaint.defs, eyePaint.defs].filter(Boolean).join('');
  const eyePositions = [
    { x: margin, y: margin },
    { x: margin + moduleCount - 7, y: margin },
    { x: margin, y: margin + moduleCount - 7 },
  ];

  const moduleMarkup: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!matrix[row]![col] || isFinderModule(row, col, moduleCount)) {
        continue;
      }
      moduleMarkup.push(
        renderShape(moduleShape, col + margin, row + margin, 1, modulePaint.fill)
      );
    }
  }

  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  const description = options.description
    ? `<desc>${escapeXml(options.description)}</desc>`
    : '';

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" role="img" aria-label="${escapeXml(
    options.title ?? 'QR code'
  )}" shape-rendering="geometricPrecision">
  ${title}
  ${description}
  ${defs ? `<defs>${defs}</defs>` : ''}
  <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${escapeXml(backgroundColor)}" />
  ${eyePositions
    .map((position) => renderEye(eyeStyle, position.x, position.y, eyePaint.fill, backgroundColor))
    .join('')}
  ${moduleMarkup.join('')}
</svg>`.trim();
}

export function generateQrCodeDataUrl(value: string, options: QrSvgOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generateQrCodeSvg(value, options))}`;
}

export function generateQrSvg(handle: string, options?: QrSvgOptions): string;
export function generateQrSvg(handle: string, baseUrl: string, options?: QrSvgOptions): string;
export function generateQrSvg(
  handle: string,
  baseUrlOrOptions?: string | QrSvgOptions,
  options: QrSvgOptions = {}
): string {
  const resolved = resolveGenerateArgs(baseUrlOrOptions, options);
  const value = buildCollectiveAgentUrl(handle, resolved.baseUrl);
  return generateQrCodeSvg(value, resolved.options);
}

export function generateQrDataUrl(handle: string, options?: QrSvgOptions): string;
export function generateQrDataUrl(handle: string, baseUrl: string, options?: QrSvgOptions): string;
export function generateQrDataUrl(
  handle: string,
  baseUrlOrOptions?: string | QrSvgOptions,
  options: QrSvgOptions = {}
): string {
  const resolved = resolveGenerateArgs(baseUrlOrOptions, options);
  const value = buildCollectiveAgentUrl(handle, resolved.baseUrl);
  return generateQrCodeDataUrl(value, resolved.options);
}
