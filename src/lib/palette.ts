// Categorical series colours, in fixed order (never cycled past the end).
// Taken from the dataviz reference palette and checked with its validator
// against this theme's white surface: the first three pass every all-pairs
// gate, so charts that put up to three lines together stay CVD-safe. Status
// colours (good / warn / bad in index.css) are kept separate on purpose.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const

export const UP = SERIES[0]
export const DOWN = SERIES[1]
