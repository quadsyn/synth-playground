/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

export const math = {
    PI: 3.1415926535897932384626433832795,
    DOUBLE_PI: 6.283185307179586476925286766559,
    HALF_PI: 1.5707963267948966192313216916398,
    QUARTER_PI: 0.78539816339744830961566084581988,
    DEG2RAD: 0.01745329251994329576923690768489,
    RAD2DEG: 57.295779513082320876798154814105,

    limit: (v: number, min: number, max: number) => v < min ? min : (v > max ? max : v),

    limitInt: function(v: number, min: number, max: number) {
        v = Math.trunc(v);
        return v < min ? min : (v > max ? max : v);
    },

    normalize: (v: number, min: number, max: number) => (v - min) / (max - min),

    normalizeLimit: (v: number, min: number, max: number) => {
        v = (v - min) / (max - min);
        return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
    },

    denormalize: (t: number, min: number, max: number) => (min + t) * (max - min),

    scale: (v: number, minIn: number, maxIn: number, minOut: number, maxOut: number) =>
        minOut + (v - minIn) / (maxIn - minIn) * (maxOut - minOut),

    scaleLimit: (v: number, minIn: number, maxIn: number, minOut: number, maxOut: number) => {
        v = v < minIn ? minIn : (v > maxIn ? maxIn : v);
        return minOut + (v - minIn) / (maxIn - minIn) * (maxOut - minOut);
    },

    deg2rad: function(degrees: number) {
        return degrees * 0.01745329251994329576923690768489;
    },

    rad2deg: function(radians: number) {
        return radians * 57.295779513082320876798154814105;
    },

    deltaRadians: function(radA: number, radB: number) {
        radA %= math.DOUBLE_PI;
        radA = radA < 0 ? radA + math.DOUBLE_PI : radA;
        radB %= math.DOUBLE_PI;
        radB = radB < 0 ? radB + math.DOUBLE_PI : radB;

        if (radB - radA > math.PI) {
            radA += math.DOUBLE_PI;
        }

        return radB - radA;
    },

    deltaDegrees: function(degA: number, degB: number) {
        degA %= math.DOUBLE_PI;
        degA = degA < 0 ? degA + math.DOUBLE_PI : degA;
        degB %= math.DOUBLE_PI;
        degB = degB < 0 ? degB + math.DOUBLE_PI : degB;

        if (degB - degA > math.PI) {
            degA += math.DOUBLE_PI;
        }

        return degB - degA;
    },

    curves: {
        linear: (t: number) => t,

        easeIn: (t: number) => Math.sin(t * math.HALF_PI),
        easeOut: (t: number) => Math.cos(t * math.HALF_PI - math.PI) + 1.0,
        ease: (t: number) => Math.cos(t * math.PI - math.PI) * 0.5 + 0.5,

        easeInQuad: (t: number) => t * t,
        easeOutQuad: (t: number) => t * (2 - t),
        easeQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

        easeInCubic: (t: number) => t * t * t,
        easeOutCubic: (t: number) => (--t) * t * t + 1,
        easeCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

        easeInQuart: (t: number) => t * t * t * t,
        easeOutQuart: (t: number) => 1 - (--t) * t * t * t,
        easeQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t
    }
};