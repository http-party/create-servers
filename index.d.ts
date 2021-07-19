import { Server as HttpServer } from 'http';
import { Server as HttpsServer, ServerOptions as NodeHttpsServerOptions } from 'https';
import { Http2SecureServer, SecureServerOptions as NodeHttp2ServerOptions } from 'http2';

type IPAddress = string;
type FilePath = string;

type PEMPath = string;
type PEMData = string | Buffer;
type PEM = PEMPath | PEMData;
type PEMChain = PEM[];
type PEMs = PEM | PEMChain;
type CertificatePEMs = PEMs | PEMs[];

type CommonOptions = {
  timeout?: number,
  handler?: Function,
}

type ServerOptions = CommonOptions & {
  port?: number,
  host: IPAddress,
}

type HttpOptions = ServerOptions;

type TLSOptions = {
  ciphers?: string,
  honorCipherOrder?: boolean,
  /**
   * Required if ca, cert or key are FilePath
   */
  root?: FilePath,
  key?: PEM,
  cert?: CertificatePEMs,
  ca?: PEMs,
}

type SNIOptions = {
  sni?: {
    [hostname: string]: TLSOptions
  }
}

type HttpsOptions = ServerOptions & TLSOptions & SNIOptions & NodeHttpsServerOptions;

type Http2Options = HttpsOptions & NodeHttp2ServerOptions;

type Options = {
  http?: HttpOptions | Array<HttpOptions>,
  https?: HttpsOptions | Array<HttpsOptions>,
  http2?: Http2Options | Array<Http2Options>,
  handler?: Function,
}

type Errors = {
  message: string,
  http?: Error | Error[],
  https?: Error | Error[],
  http2?: Error | Error[],
}

type Servers = {
  http?: HttpServer | HttpServer[],
  https?: HttpsServer | HttpsServer[],
  http2?: Http2SecureServer | Http2SecureServer[],
}

type Callback = (error?: Errors, servers?: Servers) => void;

declare function createServers(options: Options, callback: Callback): void;

export = createServers;
