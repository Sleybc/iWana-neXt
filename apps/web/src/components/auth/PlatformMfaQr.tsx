import Image from 'next/image';

export function PlatformMfaQr({
  qrCodeBase64,
  otpauthUri,
}: {
  qrCodeBase64: string;
  otpauthUri: string;
}) {
  return (
    <>
      <p className="text-sm">Escanea el código QR con tu aplicación autenticadora.</p>
      <Image
        src={qrCodeBase64}
        alt="Código QR de configuración"
        width={180}
        height={180}
        unoptimized
        className="mx-auto"
      />
      <details className="text-sm">
        <summary>Ingresar la clave manualmente</summary>
        <code className="wrap-break-word">{new URL(otpauthUri).searchParams.get('secret')}</code>
      </details>
    </>
  );
}
