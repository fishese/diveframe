import type { ComposerSettings } from "./composer-settings";
import { getOverlayFont } from "./composer-fonts";
import type { Dive, DiveSample } from "./dive-model";
import { translate } from "./i18n";
import { formatDepthValue, formatDuration } from "./unit-conversion";

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
  const labelSize = Math.max(10, Math.round(Math.min(rect.width, rect.height) * 0.045));
  const axisPadding = settings.showAxisLabels
    ? {
        left: Math.max(labelSize * 4.2, rect.width * 0.1),
        bottom: Math.max(labelSize * 3.4, rect.height * 0.24),
      }
    : { left: 0, bottom: 0 };
  const plot = {
    x: rect.x + axisPadding.left,
    y: rect.y,
    width: Math.max(1, rect.width - axisPadding.left),
    height: Math.max(1, rect.height - axisPadding.bottom),
  };
  // Keep the centre of every stroke inside the plot. Without this inset, a
  // surface point or the final sample lands exactly on the clip boundary and
  // half of the line (including a round cap) is cut away.
  const strokeInset = Math.max(1.5, settings.lineThickness / 2 + 1);
  const dataPlot = insetRect(plot, strokeInset);
  const xFor = (time: number) =>
    dataPlot.x + (clamp(time, 0, maximumTime) / maximumTime) * dataPlot.width;
  const yForDepth = (depth: number) =>
    dataPlot.y +
    (clamp(depth, 0, maximumDepth) / maximumDepth) * dataPlot.height;

  context.save();
  if (settings.showAxisLabels) {
    drawAxisGrid(context, plot, labelSize);
  }
  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.width, plot.height);
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
    fill.lineTo(
      xFor(samples[samples.length - 1].elapsedSeconds),
      dataPlot.y,
    );
    fill.lineTo(xFor(samples[0].elapsedSeconds), dataPlot.y);
    fill.closePath();
    context.globalAlpha = settings.fillOpacity;
    if (settings.depthFillMode === "fade") {
      const gradient = context.createLinearGradient(
        0,
        dataPlot.y,
        0,
        dataPlot.y + dataPlot.height,
      );
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(1, settings.depthColor);
      context.fillStyle = gradient;
    } else {
      context.fillStyle = settings.depthColor;
    }
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
        dataPlot,
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
      dataPlot,
      maximumTime,
      (sample) => sample.temperatureC,
      settings.temperatureColor,
      settings.lineThickness * 0.85,
      [4, 6],
    );
  }
  context.restore();
  if (settings.showAxisLabels) {
    drawAxisLabels(
      context,
      rect,
      plot,
      maximumTime,
      maximumDepth,
      labelSize,
      settings,
    );
  }
  context.restore();
  return true;
}

function insetRect(rect: ChartRect, inset: number): ChartRect {
  const horizontal = Math.min(inset, Math.max(0, rect.width / 2 - 0.5));
  const vertical = Math.min(inset, Math.max(0, rect.height / 2 - 0.5));
  return {
    x: rect.x + horizontal,
    y: rect.y + vertical,
    width: Math.max(1, rect.width - horizontal * 2),
    height: Math.max(1, rect.height - vertical * 2),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function drawAxisGrid(
  context: CanvasRenderingContext2D,
  plot: ChartRect,
  labelSize: number,
) {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  context.lineWidth = Math.max(1, labelSize * 0.06);
  context.setLineDash([labelSize * 0.35, labelSize * 0.5]);
  for (let index = 0; index <= 3; index += 1) {
    const y = plot.y + (plot.height * index) / 3;
    context.beginPath();
    context.moveTo(plot.x, y);
    context.lineTo(plot.x + plot.width, y);
    context.stroke();
  }
  context.setLineDash([]);
  context.strokeStyle = "rgba(255, 255, 255, 0.56)";
  context.beginPath();
  context.moveTo(plot.x, plot.y);
  context.lineTo(plot.x, plot.y + plot.height);
  context.lineTo(plot.x + plot.width, plot.y + plot.height);
  context.stroke();
  context.restore();
}

function drawAxisLabels(
  context: CanvasRenderingContext2D,
  rect: ChartRect,
  plot: ChartRect,
  maximumTime: number,
  maximumDepth: number,
  labelSize: number,
  settings: ComposerSettings,
) {
  context.save();
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.font = `500 ${labelSize}px ${getOverlayFont(settings.fontFamily).stack}`;
  context.textBaseline = "top";
  context.shadowColor = "rgba(0, 0, 0, 0.75)";
  context.shadowBlur = labelSize * 0.22;
  context.shadowOffsetY = labelSize * 0.08;

  const timeIntervals =
    plot.width < labelSize * 22 ? 1 : plot.width < labelSize * 34 ? 2 : 3;
  for (let index = 0; index <= timeIntervals; index += 1) {
    const ratio = index / timeIntervals;
    const x = plot.x + plot.width * ratio;
    const value = formatDuration(Math.round(maximumTime * ratio));
    context.textAlign =
      index === 0 ? "left" : index === timeIntervals ? "right" : "center";
    context.fillText(value, x, plot.y + plot.height + labelSize * 0.35);
  }

  context.textAlign = "center";
  context.font = `600 ${labelSize}px ${getOverlayFont(settings.fontFamily).stack}`;
  context.fillText(
    translate(settings.language, "elapsedTime"),
    plot.x + plot.width / 2,
    rect.y + rect.height - labelSize * 1.15,
  );

  context.font = `500 ${labelSize}px ${getOverlayFont(settings.fontFamily).stack}`;
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let index = 0; index <= 3; index += 1) {
    const ratio = index / 3;
    context.fillText(
      formatDepthValue(maximumDepth * ratio, settings.units, settings.decimals),
      plot.x - labelSize * 0.45,
      plot.y + plot.height * ratio,
    );
  }

  context.save();
  context.translate(rect.x + labelSize * 0.65, plot.y + plot.height / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = "center";
  context.font = `600 ${labelSize}px ${getOverlayFont(settings.fontFamily).stack}`;
  context.fillText(translate(settings.language, "depthAxis"), 0, 0);
  context.restore();
  context.restore();
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
