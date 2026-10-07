/**
 * Twikoo Netlify Function - Minimal Entry Point
 * Only handles cfimgbed image uploads to keep bundle under 250MB
 * For full Twikoo features, use official deployment with proper monorepo setup
 */

import { MongoClient } from "mongodb";

// Minimal inlined cfimgbed upload logic
async function handleCfImgBedUpload(ctx) {
  const { image, config } = ctx;
  if (!config.IMAGE_CDN_URL) throw new Error("IMAGE_CDN_URL not configured");
  if (!config.IMAGE_CDN_TOKEN) throw new Error("IMAGE_CDN_TOKEN not configured");

  const baseUrl = config.IMAGE_CDN_URL.replace(/\/$/, "");
  const params = new URLSearchParams();
  
  let authCode = config.IMAGE_CDN_TOKEN;
  let uploadChannel = "telegram";
  let useBearerAuth = false;
  let uploadNameType = "origin";
  let channelName = "";
  let serverCompress = true;
  let autoRetry = true;
  let uploadFolder = "";

  try {
    const parsed = JSON.parse(config.IMAGE_CDN_TOKEN);
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
  } catch { }

  params.append("uploadChannel", uploadChannel);
  params.append("returnFormat", "full");
  params.append("uploadNameType", uploadNameType);
  params.append("serverCompress", String(serverCompress));
  params.append("autoRetry", String(autoRetry));
  if (channelName) params.append("channelName", channelName);
  if (uploadFolder) params.append("uploadFolder", uploadFolder);

  const FormData = (await import("form-data")).default;
  const formData = new FormData();
  formData.append("file", Buffer.from(image.body), { 
    filename: image.fileName, 
    contentType: image.mimeType 
  });

  let uploadResult;
  const url = `${baseUrl}/upload?${params.toString()}`;

  if (useBearerAuth) {
    uploadResult = await fetch(url, {
      method: "POST",
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${authCode}` },
      body: formData
    });
  } else {
    params.append("authCode", authCode);
    const finalUrl = `${baseUrl}/upload?${params.toString()}`;
    uploadResult = await fetch(finalUrl, { 
      method: "POST", 
      headers: formData.getHeaders(), 
      body: formData 
    });
  }

  const data = await uploadResult.json();
  if (data?.[0]?.src) return { url: data[0].src, thumb: data[0].src, del: "" };
  if (data?.src) return { url: data.src, thumb: data.src, del: "" };
  throw new Error("Cloudflare ImgBed upload failed: " + JSON.stringify(data));
}

// Netlify Function Handler
export default async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const eventName = body.event;

    if (eventName === "UPLOAD_IMAGE" && body.config?.IMAGE_CDN === "cfimgbed") {
      const image = parseImage(body.photo);
      const config = await getConfig();
      const result = await handleCfImgBedUpload({ image, config, res: {} });
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: 0, data: result }) };
    }

    // Health check
    if (eventName === "GET_FUNC_VERSION") {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: 0, version: "2.0.12-cfimgbed" }) };
    }

    // For other events, return not implemented
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: 1000, message: "Minimal Twikoo Function - cfimgbed only. Use official deployment for full features." }) };
  } catch (e) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: 1000, message: e.message }) };
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

// Minimal helpers
async function getConfig() { return {}; }
function parseImage(photo) {
  if (!photo || typeof photo !== "string") throw new Error("Invalid image data");
  const match = photo.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image format");
  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  return { body: buffer, mimeType, fileName: `image.${mimeType.split("/")[1] || "png"}` };
}