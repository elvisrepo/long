function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var isApiPath = uri === "/api" || uri.indexOf("/api/") === 0;
  var isAssetPath = uri === "/assets" || uri.indexOf("/assets/") === 0;
  var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  var hasFileExtension = lastSegment.indexOf(".") !== -1;
  var isReadRequest = request.method === "GET" || request.method === "HEAD";

  if (isReadRequest && !isApiPath && !isAssetPath && !hasFileExtension) {
    request.uri = "/index.html";
  }
  return request;
}
