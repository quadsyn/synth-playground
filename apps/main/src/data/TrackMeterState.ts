export interface Type {
    peakLeft: number;
    peakRight: number;
    trailLeft: number;
    trailLeftVelocity: number;
    trailLeftHoldTimer: number;
    trailRight: number;
    trailRightVelocity: number;
    trailRightHoldTimer: number;
}

export function make(): Type {
    return {
        peakLeft: 0,
        peakRight: 0,
        trailLeft: 0,
        trailLeftVelocity: 0,
        trailLeftHoldTimer: 0,
        trailRight: 0,
        trailRightVelocity: 0,
        trailRightHoldTimer: 0,
    };
}

export function update(
    state: Type,
    dt: number,
    newPeakLeft: number,
    newPeakRight: number,
): void {
    const oldTrailLeft: number = state.trailLeft;
    const oldTrailLeftVelocity: number = state.trailLeftVelocity;
    const oldTrailLeftHoldTimer: number = state.trailLeftHoldTimer;
    const oldTrailRight: number = state.trailRight;
    const oldTrailRightVelocity: number = state.trailRightVelocity;
    const oldTrailRightHoldTimer: number = state.trailRightHoldTimer;

    let newTrailLeftVelocity: number = oldTrailLeftVelocity + Constants.Gravity * dt;
    let newTrailLeft: number = oldTrailLeft + newTrailLeftVelocity * dt;
    let newTrailLeftHoldTimer: number = oldTrailLeftHoldTimer;
    if (newTrailLeftHoldTimer < Constants.HoldDuration) {
        newTrailLeftHoldTimer += dt;
        newTrailLeft = oldTrailLeft;
        newTrailLeftVelocity = oldTrailLeftVelocity;
    }
    if (newPeakLeft >= newTrailLeft) {
        newTrailLeft = newPeakLeft;
        newTrailLeftVelocity = 0;
        newTrailLeftHoldTimer = 0;
    }

    let newTrailRightVelocity: number = oldTrailRightVelocity + Constants.Gravity * dt;
    let newTrailRight: number = oldTrailRight + newTrailRightVelocity * dt;
    let newTrailRightHoldTimer: number = oldTrailRightHoldTimer;
    if (newTrailRightHoldTimer < Constants.HoldDuration) {
        newTrailRightHoldTimer += dt;
        newTrailRight = oldTrailRight;
        newTrailRightVelocity = oldTrailRightVelocity;
    }
    if (newPeakRight >= newTrailRight) {
        newTrailRight = newPeakRight;
        newTrailRightVelocity = 0;
        newTrailRightHoldTimer = 0;
    }

    state.peakLeft = newPeakLeft;
    state.peakRight = newPeakRight;
    state.trailLeft = newTrailLeft;
    state.trailLeftVelocity = newTrailLeftVelocity;
    state.trailLeftHoldTimer = newTrailLeftHoldTimer;
    state.trailRight = newTrailRight;
    state.trailRightVelocity = newTrailRightVelocity;
    state.trailRightHoldTimer = newTrailRightHoldTimer;
}

export function clear(state: Type): void {
    state.peakLeft = 0;
    state.peakRight = 0;
    state.trailLeft = 0;
    state.trailLeftVelocity = 0;
    state.trailLeftHoldTimer = 0;
    state.trailRight = 0;
    state.trailRightVelocity = 0;
    state.trailRightHoldTimer = 0;
}

export const enum Constants {
    MinDecibels = -60,
    MaxDecibels = 2,
    HoldDuration = 1, // In seconds.
    Gravity = -0.5, // In units per second.
}
