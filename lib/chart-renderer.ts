import type { ComposerSettings } from "./composer-settings";
import type { Dive, DiveSample } from "./dive-model";

export type ChartRect = { x: number; y: number; width: number; height: number };

export function downsampleProfile(samples: DiveSample[], maximumPoints: number) {
  if (samples.length <= maximumPoints) return samples;
  const bucketSize = Math.max(1, Math.ceil(samples.length / Math.floor(maximumPoints / 2)));
  const selected: DiveSample[] = [samples[0]];
  for (let index = 1; index < samples.length - 1; index += bucketSize) {
    const bucket = samples.slice(index, Math.min(index + bucketSize, samples.length - 1));
    let minimum = bucket[0];
    let maximum = bucket[0];
    for (const sample of bucket) {
      if (sample.depthM < minimum.depthM) minimum = sample;
      if (sample.depthM > maximum.depthM) maximum = sample;
    }
    selected.push(...([minimum, maximum].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds)));
  }
  selected.push(samples[samples.length - 1]);
  return selected;
}

export function chartAvailability(dive: Dive) {
  return {
    depth: dive.samples.some((sample) => Number.isFinite(sample.depthM)),
    pressure: dive.samples.some((sample) =>
      sample.pressuresBar.some((pressure) => Number.isFinite(pressure)),
    ),
    temperature: dive.samples.some((sample) => Number.isFinite(sample.temperatureC)),
  };
}

export function renderDiveChart(
  context: CanvasRenderingContext2D,
  rect: ChartRect,
  dive: Dive,
  settings: ComposerSettings,
) {
  if (settings.chartMode === "hidden" || !dive.samples.length) return false;
  const samples = downsampleProfile(dive.samples, Math.max(240, Math.round(rect.width / 2)));
  const maximumTime = Math.max(...samples.map((sample) => sample.elapsedSeconds), 1);
  const maximumDepth = Math.max(...samples.map((sample) => sample.depthM), 1);
  const xFor = (time: number) => rect.x + (time / maximumTime) * rect.width;
  const yForDepth = (depth: number) => rect.y + (depth / maximumDepth) * rect.height;

  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.lineJoin = "round";
  context.lineCap = "round";

  const depthPath = new Path2D();
  samples.forEach((sample, index) => {
    const x = xFor(sample.elapsedSeconds);
    const y = yForDepth(sample.depthM);
    if (index === 0) depthPath.moveTo(x, y);
    else depthPath.lineTo(x, y);
  });
  if (settings.fillOpacity > 0) {
    const fill = new Path2D(depthPath);
    fill.lineTo(xFor(samples[samples.length - 1].elapsedSeconds), rect.y);
    fill.lineTo(xFor(samples[0].elapsedSeconds), rect.y);
    fill.closePath();
    context.globalAlpha = settings.fillOpacity;
    context.fillStyle = settings.depthColor;
    context.fill(fill);
    context.globalAlpha = 1;
  }
  context.strokeStyle = settings.depthColor;
  context.lineWidth = settings.lineThickness;
  context.stroke(depthPath);

  const wantsPressure = settings.chartMode.includes("pressure");
  const wantsTemperature = settings.chartMode.includes("temperature");
  if (wantsPressure) {
    const cylinders = Math.max(...samples.map((sample) => sample.pressuresBar.length), 0);
    for (let cylinder = 0; cylinder < cylinders; cylinder += 1) {
      renderSparseLine(
        context,
        samples,
        rect,
        maximumTime,
        (sample) => sample.pressuresBar[cylinder],
        settings.pressureColor,
        settings.lineThickness * Math.max(0.55, 1 - cylinder * 0.12),
        cylinder ? [10, 7] : [],
      );
    }
  }
  if (wantsTemperature) {
    renderSparseLine(
      context,
      samples,
      rect,
      maximumTime,
      (sample) => sample.temperatureC,
      settings.temperatureColor,
      settings.lineThickness * 0.85,
      [4, 6],
    );
  }
  context.restore();
  return true;
}

function renderSparseLine(
  context: CanvasRenderingContext2D,
  samples: DiveSample[],
  rect: ChartRect,
  maximumTime: number,
  valueFor: (sample: DiveSample) => number | undefined,
  color: string,
  thickness: number,
  dash: number[],
) {
  const values = samples
    .map((sample) => ({ sample, value: valueFor(sample) }))
    .filter((item): item is { sample: DiveSample; value: number } =>
      Number.isFinite(item.value),
    );
  if (values.length < 2) return;
  const minimum = Math.min(...values.map((item) => item.value));
  const maximum = Math.max(...values.map((item) => item.value));
  const range = Math.max(maximum - minimum, 1);
  context.beginPath();
  values.forEach(({ sample, value }, index) => {
    const x = rect.x + (sample.elapsedSeconds / maximumTime) * rect.width;
    const y = rect.y + rect.height - ((value - minimum) / range) * rect.height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.setLineDash(dash);
  context.stroke();
  context.setLineDash([]);
}

