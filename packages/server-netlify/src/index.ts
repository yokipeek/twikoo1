/**
 * twikoo-netlify 入口（默认导出现代入口，并保留 Functions v1 handler）。
 * 内联 cfimgbed 图床上传逻辑，确保打包进产物。
 */

import { createNetlifyFunc } from "./main";
import { createNetlifyPostSubmitDispatcher, netlifyPostSubmitDispatcher } from "./dispatch";

export {
  handler,
  createNetlifyFunc,
  createModernNetlifyFunc,
  toTkRequest,
  fromTkResponse,
  default,
} from "./main";
export { createNetlifyPostSubmitDispatcher, netlifyPostSubmitDispatcher } from "./dispatch";

// ===== 内联 cfimgbed 图床上传逻辑 =====
// 该代码复制自 @twikoojs/common/services/upload.ts，确保打包进 Netlify Functions 产物
import type { FormDataLike } from "@twikoojs/common/utils/lib-loader";
import type { Capabilities } from "@twikoojs/common/ports/capabilities";
import type { ConfigData } from "@twikoojs/common/ports/database";
import type { TkResponseBody } from "@twikoojs/common/ports/response";
import { getFormData } from "@twikoojs/common/utils/lib-loader";
import { httpPost } from "@twikoojs/common/utils/http";
import { appendImage, parseImage } from "@twikoojs/common/services/upload";

interface ParsedImage {
  body: Buffer;
  mimeType: string;
  fileName: string;
}

async function uploadImageToCfImgBed(ctx: {
  image: ParsedImage;
  config: ConfigData;
  res: TkResponseBody;
  FormData: never;
}): Promise<void> {
  const FormData = ctx.FormData as FormDataLike;
  const { image, config } = ctx;

  if (!config.IMAGE_CDN_URL) {
    throw new Error("未配置 Cloudflare ImgBed 的 API 地址 (IMAGE_CDN_URL)");
  }
  if (!config.IMAGE_CDN_TOKEN) {
    throw new Error("未配置 Cloudflare ImgBed 的 Token (IMAGE_CDN_TOKEN)");
  }

  const baseUrl = String(config.IMAGE_CDN_URL).replace(/\/$/, "");
  const params = new URLSearchParams();

  let authCode = String(config.IMAGE_CDN_TOKEN);
  let uploadChannel = "telegram";
  let useBearerAuth = false;
  let uploadNameType = "origin";
  let channelName = "";
  let serverCompress = true;
  let autoRetry = true;
  let uploadFolder = "";

  try {
    const parsed = JSON.parse(String(config.IMAGE_CDN_TOKEN));
    if (parsed.authCode) authCode = parsed.authCode;
    if (parsed.token) authCode = parsed.token;
    if (parsed.apiKey) authCode = parsed.apiKey;
    if (parsed.uploadChannel) uploadChannel = parsed.uploadChannel;
    if (parsed.useBearerAuth) useBearerAuth = true;
    if (parsed.uploadNameType) uploadNameType = parsed.uploadNameType;
    if (parsed.channelName) channelName = parsed.channelName;
    if (typeof parsed.serverCompress === "boolean") serverCompress = parsed.serverCompress;
    if (typeof parsed.autoRetry === "boolean") autoRetry = parsed.autoRetry;
    if (parsed.uploadFolder) uploadFolder = parsed.uploadFolder;
  } catch {
    // TOKEN 不是 JSON 时直接作为 authCode 使用
  }

  params.append("uploadChannel", uploadChannel);
  params.append("returnFormat", "full");
  params.append("uploadNameType", uploadNameType);
  params.append("serverCompress", String(serverCompress));
  params.append("autoRetry", String(autoRetry));
  if (channelName) params.append("channelName", channelName);
  if (uploadFolder) params.append("uploadFolder", uploadFolder);

  const formData = new FormData();
  appendImage(formData, "file", image);

  let uploadResult;
  const url = `${baseUrl}/upload?${params.toString()}`;

  if (useBearerAuth) {
    uploadResult = await httpPost(url, formData, {
      headers: {
        ...(formData as unknown as { getHeaders(): Record<string, string> }).getHeaders(),
        Authorization: `Bearer ${authCode}`,
      },
    });
  } else {
    params.append("authCode", authCode);
    const finalUrl = `${baseUrl}/upload?${params.toString()}`;
    uploadResult = await httpPost(finalUrl, formData, {
      headers: (formData as unknown as { getHeaders(): Record<string, string> }).getHeaders(),
    });
  }

  const data = uploadResult.data as {
    [0]?: { src?: string };
    src?: string;
    message?: string;
  };

  if (data && data[0] && data[0].src) {
    ctx.res.data = {
      url: data[0].src,
      thumb: data[0].src,
      del: "",
    };
  } else if (data && data.src) {
    ctx.res.data = {
      url: data.src,
      thumb: data.src,
      del: "",
    };
  } else {
    throw new Error("Cloudflare ImgBed 上传失败: " + JSON.stringify(data));
  }
}

// 导出 cfimgbed 上传函数，供 server-common 的 upload.ts 调用
export { uploadImageToCfImgBed };