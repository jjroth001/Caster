package org.caster.playercore

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts small secrets (private feeds' sign-ins for the background check) with a key that
 * lives in Android's keystore and never leaves it, so the files Caster writes hold nothing
 * readable.
 */
internal object SecretBox {
  private const val ALIAS = "caster-secrets"
  private const val TRANSFORM = "AES/GCM/NoPadding"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  fun encrypt(plain: String): String {
    val cipher = Cipher.getInstance(TRANSFORM)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val sealed = cipher.iv + cipher.doFinal(plain.toByteArray())
    return Base64.encodeToString(sealed, Base64.NO_WRAP)
  }

  fun decrypt(sealed: String): String? =
    runCatching {
      val bytes = Base64.decode(sealed, Base64.NO_WRAP)
      val cipher = Cipher.getInstance(TRANSFORM)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
      String(cipher.doFinal(bytes, 12, bytes.size - 12))
    }.getOrNull()
}
