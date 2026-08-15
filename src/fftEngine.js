/**
 * maple-starforce-analyzer - fftEngine.js
 * 고속 푸리에 변환(FFT)을 이용한 대규모 확률 질량 함수(PMF) 합성곱 엔진
 */

export class FFTEngine {
  /**
   * Cooley-Tukey Radix-2 FFT
   * @param {Float64Array} real 
   * @param {Float64Array} imag 
   * @param {boolean} inverse 
   */
  static transform(real, imag, inverse = false) {
    const n = real.length;
    if (n <= 1) return;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        const tempR = real[i]; real[i] = real[j]; real[j] = tempR;
        const tempI = imag[i]; imag[i] = imag[j]; imag[j] = tempI;
      }
      let k = n >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }

    // Cooley-Tukey Iterative
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const angle = (inverse ? 2 * Math.PI : -2 * Math.PI) / len;
      const wStepR = Math.cos(angle);
      const wStepI = Math.sin(angle);

      for (let i = 0; i < n; i += len) {
        let wR = 1.0;
        let wI = 0.0;
        for (let k = 0; k < halfLen; k++) {
          const uR = real[i + k];
          const uI = imag[i + k];
          const vR = real[i + k + halfLen] * wR - imag[i + k + halfLen] * wI;
          const vI = real[i + k + halfLen] * wI + imag[i + k + halfLen] * wR;

          real[i + k] = uR + vR;
          imag[i + k] = uI + vI;
          real[i + k + halfLen] = uR - vR;
          imag[i + k + halfLen] = uI - vI;

          const nextWR = wR * wStepR - wI * wStepI;
          wI = wR * wStepI + wI * wStepR;
          wR = nextWR;
        }
      }
    }

    if (inverse) {
      for (let i = 0; i < n; i++) {
        real[i] /= n;
        imag[i] /= n;
      }
    }
  }

  /**
   * 두 1차원 이산 확률분포(PMF)의 FFT 합성곱 (P * Q)
   */
  static convolve(pmfA, pmfB) {
    if (!pmfA || pmfA.length === 0) return pmfB || new Float64Array([1]);
    if (!pmfB || pmfB.length === 0) return pmfA || new Float64Array([1]);

    const targetLen = pmfA.length + pmfB.length - 1;
    let size = 1;
    while (size < targetLen) size <<= 1;

    const realA = new Float64Array(size);
    const imagA = new Float64Array(size);
    const realB = new Float64Array(size);
    const imagB = new Float64Array(size);

    realA.set(pmfA);
    realB.set(pmfB);

    this.transform(realA, imagA, false);
    this.transform(realB, imagB, false);

    // Pointwise Complex Multiplication
    for (let i = 0; i < size; i++) {
      const r = realA[i] * realB[i] - imagA[i] * imagB[i];
      const im = realA[i] * imagB[i] + imagA[i] * realB[i];
      realA[i] = r;
      imagA[i] = im;
    }

    this.transform(realA, imagA, true);

    const result = new Float64Array(targetLen);
    let sum = 0;
    for (let i = 0; i < targetLen; i++) {
      const val = Math.max(0, realA[i]);
      result[i] = val;
      sum += val;
    }

    // 정규화
    if (sum > 0) {
      for (let i = 0; i < targetLen; i++) {
        result[i] /= sum;
      }
    }

    return result;
  }

  /**
   * 다중 확률분포 리스트 [PMF1, PMF2, ...]를 분할정복(Divide & Conquer) FFT로 합성
   */
  static convolveMultiple(pmfList) {
    if (!pmfList || pmfList.length === 0) return new Float64Array([1]);
    if (pmfList.length === 1) return pmfList[0];

    const queue = [...pmfList];
    while (queue.length > 1) {
      const nextQueue = [];
      for (let i = 0; i < queue.length; i += 2) {
        if (i + 1 < queue.length) {
          nextQueue.push(this.convolve(queue[i], queue[i + 1]));
        } else {
          nextQueue.push(queue[i]);
        }
      }
      queue.length = 0;
      queue.push(...nextQueue);
    }
    return queue[0];
  }
}
