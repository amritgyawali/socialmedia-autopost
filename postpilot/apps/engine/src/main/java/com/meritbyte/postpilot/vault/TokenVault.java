package com.meritbyte.postpilot.vault;

import com.meritbyte.postpilot.config.PostPilotProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;

@Service
public class TokenVault {
    private static final byte VERSION = 1;
    private static final int NONCE_BYTES = 12;
    private static final byte[] AAD = "postpilot-token-v1".getBytes(StandardCharsets.UTF_8);
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public TokenVault(PostPilotProperties properties) {
        try {
            byte[] decoded = Base64.getDecoder().decode(properties.vault().key());
            if (decoded.length != 32) throw new IllegalArgumentException("VAULT_KEY must decode to exactly 32 bytes");
            this.key = new SecretKeySpec(decoded, "AES");
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("VAULT_KEY must be a base64-encoded 32-byte AES key", e);
        }
    }

    public byte[] encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(AAD);
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(1 + NONCE_BYTES + ciphertext.length)
                    .put(VERSION).put(nonce).put(ciphertext).array();
        } catch (Exception e) {
            throw new IllegalStateException("Could not encrypt OAuth token", e);
        }
    }

    public String decrypt(byte[] envelope) {
        if (envelope == null) return null;
        if (envelope.length < 1 + NONCE_BYTES + 16 || envelope[0] != VERSION) {
            throw new IllegalArgumentException("Invalid encrypted token envelope");
        }
        try {
            byte[] nonce = Arrays.copyOfRange(envelope, 1, 1 + NONCE_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(envelope, 1 + NONCE_BYTES, envelope.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(AAD);
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Could not decrypt OAuth token; check VAULT_KEY", e);
        }
    }
}
