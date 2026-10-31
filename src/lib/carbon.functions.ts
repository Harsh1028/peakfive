import { createServerFn } from "@tanstack/react-start";
import { carbonOptionsSchema, scheduleEnergy, type CarbonReply, type CarbonOptions } from "./carbon";
import { type OptimizeRequest, type OptimizeResponse } from "./peakfive-api";
import { requestCarbon } from "./carbon.server";

export const calculateCarbon = createServerFn({ method: "POST" })
  .inputValidator((input: { result: OptimizeResponse; request: OptimizeRequest; options: CarbonOptions }) => {
    const options = carbonOptionsSchema.parse(input.options);
    const { kwh } = scheduleEnergy(input.result, input.request, options);
    if (kwh > 1000000) throw new Error("Electricity quantity exceeds demo accounting limits.");
    return { kwh, year: options.year };
  })
  .handler(async ({ data }): Promise<CarbonReply> => {
    const key = process.env["CLIMATIQ_API_KEY"];
    if (!key) return { ok: false, error: "Climatiq key is not configured. Add CLIMATIQ_API_KEY through Lovable’s secure Add Secret form." };
    return requestCarbon(data.kwh, data.year, key);
  });