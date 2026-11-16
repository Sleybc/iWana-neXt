import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptObjectBuffer, encryptObjectBuffer } from '@iwana/storage';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../common/crypto/aes-gcm.util';
import { resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';
import { hashDocumentNumber } from '../../common/crypto/hash-document.util';
import { hashEmail } from '../../common/crypto/hash-email.util';

/**
 * Cifrado de la importación (ADR-110 D2, D9): ZIP en reposo con el formato de objetos de
 * medios (`IWE1`) y carga útil de las intermedias en texto `iv:tag:ciphertext`, ambos con la
 * clave PII activa (inventario K2). HMAC del documento con `PII_HASH_KEY`, igual que CRM.
 *
 * Usuarios del personal desde UISP (ADR-110 D15): la clave de aplicación
 * (`migration_source_connections.app_key_encrypted`) y el nombre y el correo de la fila de
 * revisión (`migration_uisp_users.display_name_encrypted`, `email_encrypted`) se cifran aquí
 * como texto; el HMAC del correo sigue la normalización de Usuarios (`hashEmail`).
 */
@Injectable()
export class MigrationCrypto {
  private readonly activeKey: Buffer;
  private readonly readKeys: Buffer[];
  private readonly hashKey: Buffer;

  constructor(config: ConfigService) {
    const keys = loadPiiAesGcmKeyPair(config);
    this.activeKey = keys.activeKey;
    this.readKeys = [keys.activeKey, ...keys.previousKey];
    this.hashKey = resolvePiiHashKey(config);
  }

  encryptObject(plain: Buffer): Buffer {
    return encryptObjectBuffer(plain, this.activeKey);
  }

  decryptObject(blob: Buffer): Buffer {
    return decryptObjectBuffer(blob, this.readKeys);
  }

  encryptPayload(payload: unknown): string {
    return encryptAes256Gcm(JSON.stringify(payload), this.activeKey);
  }

  decryptPayload<T = unknown>(encrypted: string): T {
    return JSON.parse(decryptAes256Gcm(encrypted, this.activeKey, this.readKeys.slice(1))) as T;
  }

  encryptText(plain: string): string {
    return encryptAes256Gcm(plain, this.activeKey);
  }

  decryptText(encrypted: string): string {
    return decryptAes256Gcm(encrypted, this.activeKey, this.readKeys.slice(1));
  }

  /** HMAC del correo como `users.email_hmac` (minúsculas y sin espacios). */
  emailHmac(email: string): string {
    return hashEmail(email, this.hashKey);
  }

  documentHmac(normalizedDocument: string): string {
    return hashDocumentNumber(normalizedDocument, this.hashKey);
  }
}
