import {Trace} from "../util/trace";
import {HttpHeaders} from "./authenticationProvider";
import {HttpConnection, HttpResponse} from "./web-client";

interface FetchHttpResponse {
    statusCode: number;
    statusMessage: string | undefined;
    responseType: string;
    response: any;
}

export class FetchConnection implements HttpConnection {
    constructor(
        private url: string,
        private getHeaders: () => Promise<HttpHeaders>,
        private reauthenticate: () => Promise<boolean>
    ) {
    }

    get(path: string): Promise<{}> {
        return Trace.dependency('GET', path, async () => {
            let headers = await this.getHeaders();
            let response = await this.httpGet(path, headers);
            if (response.statusCode === 401 || response.statusCode === 407 || response.statusCode === 419) {
                const retry = await this.reauthenticate();
                if (retry) {
                    headers = await this.getHeaders();
                    response = await this.httpGet(path, headers);
                }
            }
            if (response.statusCode >= 400) {
                throw new Error(response.statusMessage);
            } else if (response.statusCode === 200) {
                if (response.responseType === 'json') {
                    return <{}>response.response;
                } else {
                    return <{}>JSON.parse(response.response);
                }
            } else {
                throw new Error(`Unexpected status code ${response.statusCode}: ${response.statusMessage}`);
            }
        });
    }

    private httpGet(tail: string, headers: HttpHeaders): Promise<FetchHttpResponse> {
        return new Promise<FetchHttpResponse>((resolve, reject) => {
            fetch(this.url + tail, {
                headers: getFetchHeaders(headers)
            })
                .then(response => {
                    if (response.ok) {
                        resolve({
                            statusCode: response.status,
                            statusMessage: response.statusText,
                            responseType: response.headers.get('Content-Type') || '',
                            response: response.body
                        });
                    }
                });
        });
    }

    getStream(path: string, onResponse: (response: {}) => Promise<void>, onError: (err: Error) => void): () => void {
        return function () {
        };
    }

    post(path: string, body: {} | string, timeoutSeconds: number): Promise<HttpResponse> {
        return Trace.dependency('POST', path, async () => {
            let headers = await this.getHeaders();
            let response = await this.httpPost(path, headers, body, timeoutSeconds);
            if (response.statusCode === 401 || response.statusCode === 407 || response.statusCode === 419) {
                const reauthenticated = await this.reauthenticate();
                if (reauthenticated) {
                    headers = await this.getHeaders();
                    response = await this.httpPost(path, headers, body, timeoutSeconds);
                }
            }
            if (response.statusCode === 403) {
                throw new Error(response.statusMessage);
            } else if (response.statusCode >= 400) {
                return {
                    result: "retry",
                    error: response.statusMessage || "Unknown error"
                }
            } else if (response.statusCode === 201) {
                return {
                    result: "success",
                    response: {}
                };
            } else if (response.statusCode === 200) {
                if (response.responseType === 'json') {
                    return {
                        result: "success",
                        response: response.response
                    };
                } else {
                    return {
                        result: "success",
                        response: JSON.parse(response.response)
                    };
                }
            } else {
                throw new Error(`Unexpected status code ${response.statusCode}: ${response.statusMessage}`);
            }
        });
    }

    private httpPost(tail: string, headers: HttpHeaders, body: string | {}, timeoutSeconds: number): Promise<XHRHttpResponse> {
        return new Promise<FetchHttpResponse>((resolve, reject) => {
            fetch(this.url + tail, {
                method: 'POST',
                headers: getFetchHeaders(headers),
                body: typeof body === 'string' ? body : JSON.stringify(body)
            })
                .then(response => {
                    if (response.ok) {
                        resolve({
                            statusCode: response.status,
                            statusMessage: response.statusText,
                            responseType: response.headers.get('Content-Type') || '',
                            response: response.body
                        });
                    }

                })
                .catch(err => {
                    Trace.warn('Network request failed.');
                    resolve({
                        statusCode: 500,
                        statusMessage: "Network request failed",
                        responseType: response.headers.get('Content-Type') || '',
                        response: err.message
                    });
                });
            })
            const xhr = new XMLHttpRequest();
            xhr.open("POST", this.url + tail, true);
            xhr.onload = () => {
                resolve({
                    statusCode: xhr.status,
                    statusMessage: xhr.statusText,
                    responseType: xhr.responseType,
                    response: xhr.response,
                });
            };
            xhr.ontimeout = (event) => {
                Trace.warn('Network request timed out.');
                resolve({
                    statusCode: 408,
                    statusMessage: "Request Timeout",
                    responseType: xhr.responseType,
                    response: xhr.response
                });
            };
            xhr.onerror = (event) => {
                Trace.warn('Network request failed.');
                resolve({
                    statusCode: 500,
                    statusMessage: "Network request failed",
                    responseType: xhr.responseType,
                    response: xhr.response
                });
            };
            xhr.setRequestHeader('Accept', 'application/json');
            setHeaders(headers, xhr);
            xhr.timeout = timeoutSeconds * 1000;
            if (typeof body === 'string') {
                xhr.setRequestHeader('Content-Type', 'text/plain');
                xhr.send(body);
            }
            else {
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify(body));
            }
        });
    }


}


function getFetchHeaders(headers: HttpHeaders) {
    const fetchHeaders = new Headers();
    for (const key in headers) {
        const value = headers[key];
        if (value) {
            fetchHeaders.append(key, value);
        }
    }
    return fetchHeaders;
}
