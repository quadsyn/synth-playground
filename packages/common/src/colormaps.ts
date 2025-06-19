// Polynomial approximations of some colormaps, from:
// - https://www.shadertoy.com/view/WlfXRN (viridis, magma, inferno)
// - https://www.shadertoy.com/view/3lBXR3 (turbo)
// Those are under the CC0 license (pretty much the same thing as public domain).
export function viridis_r(t: number): number {
    const c0: number = 0.2777273272234177;
    const c1: number = 0.1050930431085774;
    const c2: number = -0.3308618287255563;
    const c3: number = -4.634230498983486;
    const c4: number = 6.228269936347081;
    const c5: number = 4.776384997670288;
    const c6: number = -5.435455855934631;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function viridis_g(t: number): number {
    const c0: number = 0.005407344544966578;
    const c1: number = 1.404613529898575;
    const c2: number = 0.214847559468213;
    const c3: number = -5.799100973351585;
    const c4: number = 14.17993336680509;
    const c5: number = -13.74514537774601;
    const c6: number = 4.645852612178535;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function viridis_b(t: number): number {
    const c0: number = 0.3340998053353061;
    const c1: number = 1.384590162594685;
    const c2: number = 0.09509516302823659;
    const c3: number = -19.33244095627987;
    const c4: number = 56.69055260068105;
    const c5: number = -65.35303263337234;
    const c6: number = 26.3124352495832;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function viridis(t: number): [r: number, g: number, b: number] {
    return [viridis_r(t), viridis_g(t), viridis_b(t)];
}
export function magma_r(t: number): number {
    const c0: number = -0.002136485053939582;
    const c1: number = 0.2516605407371642;
    const c2: number = 8.353717279216625;
    const c3: number = -27.66873308576866;
    const c4: number = 52.17613981234068;
    const c5: number = -50.76852536473588;
    const c6: number = 18.65570506591883;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function magma_g(t: number): number {
    const c0: number = -0.000749655052795221;
    const c1: number = 0.6775232436837668;
    const c2: number = -3.577719514958484;
    const c3: number = 14.26473078096533;
    const c4: number = -27.94360607168351;
    const c5: number = 29.04658282127291;
    const c6: number = -11.48977351997711;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function magma_b(t: number): number {
    const c0: number = -0.005386127855323933;
    const c1: number = 2.494026599312351;
    const c2: number = 0.3144679030132573;
    const c3: number = -13.64921318813922;
    const c4: number = 12.94416944238394;
    const c5: number = 4.23415299384598;
    const c6: number = -5.601961508734096;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function magma(t: number): [r: number, g: number, b: number] {
    return [magma_r(t), magma_g(t), magma_b(t)];
}
export function inferno_r(t: number): number {
    const c0: number = 0.0002189403691192265;
    const c1: number = 0.1065134194856116;
    const c2: number = 11.60249308247187;
    const c3: number = -41.70399613139459;
    const c4: number = 77.162935699427;
    const c5: number = -71.31942824499214;
    const c6: number = 25.13112622477341;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function inferno_g(t: number): number {
    const c0: number = 0.001651004631001012;
    const c1: number = 0.5639564367884091;
    const c2: number = -3.972853965665698;
    const c3: number = 17.43639888205313;
    const c4: number = -33.40235894210092;
    const c5: number = 32.62606426397723;
    const c6: number = -12.24266895238567;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function inferno_b(t: number): number {
    const c0: number = -0.01948089843709184;
    const c1: number = 3.932712388889277;
    const c2: number = -15.9423941062914;
    const c3: number = 44.35414519872813;
    const c4: number = -81.80730925738993;
    const c5: number = 73.20951985803202;
    const c6: number = -23.07032500287172;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function inferno(t: number): [r: number, g: number, b: number] {
    return [inferno_r(t), inferno_g(t), inferno_b(t)];
}
export function turbo_r(t: number): number {
    const c0: number = 0.1140890109226559;
    const c1: number = 6.716419496985708;
    const c2: number = -66.09402360453038;
    const c3: number = 228.7660791526501;
    const c4: number = -334.8351565777451;
    const c5: number = 218.7637218434795;
    const c6: number = -52.88903478218835;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function turbo_g(t: number): number {
    const c0: number = 0.06288340699912215;
    const c1: number = 3.182286745507602;
    const c2: number = -4.9279827041226;
    const c3: number = 25.04986699771073;
    const c4: number = -69.31749712757485;
    const c5: number = 67.52150567819112;
    const c6: number = -21.54527364654712;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function turbo_b(t: number): number {
    const c0: number = 0.2248337216805064;
    const c1: number = 7.571581586103393;
    const c2: number = -10.09439367561635;
    const c3: number = -91.54105330182436;
    const c4: number = 288.5858850615712;
    const c5: number = -305.2045772184957;
    const c6: number = 110.5174647748972;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
export function turbo(t: number): [r: number, g: number, b: number] {
    return [turbo_r(t), turbo_g(t), turbo_b(t)];
}
