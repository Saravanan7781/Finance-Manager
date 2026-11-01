package expo.modules.smsreader

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    AsyncFunction("isSupported") {
      return@AsyncFunction true
    }

    AsyncFunction("getSms") { options: Map<String, Any?>? ->
      val context: Context = appContext.reactContext ?: throw Exception("React context not available")
      val maxCount = (options?.get("limit") as? Number)?.toInt() ?: 300
      val sinceDate = (options?.get("since") as? Number)?.toLong() ?: 0L

      val smsList = mutableListOf<Map<String, Any?>>()
      val uri = Uri.parse("content://sms/inbox")

      val projection = arrayOf("_id", "address", "body", "date")
      val selection = if (sinceDate > 0) "date >= ?" else null
      val selectionArgs = if (sinceDate > 0) arrayOf(sinceDate.toString()) else null
      val sortOrder = "date DESC"

      try {
        val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
        cursor?.use {
          val idCol = it.getColumnIndex("_id")
          val addressCol = it.getColumnIndex("address")
          val bodyCol = it.getColumnIndex("body")
          val dateCol = it.getColumnIndex("date")

          while (it.moveToNext() && smsList.size < maxCount) {
            val id = if (idCol >= 0) it.getString(idCol) ?: "" else ""
            val address = if (addressCol >= 0) it.getString(addressCol) ?: "" else ""
            val body = if (bodyCol >= 0) it.getString(bodyCol) ?: "" else ""
            val date = if (dateCol >= 0) it.getLong(dateCol) else 0L

            smsList.add(mapOf(
              "_id" to id,
              "address" to address,
              "body" to body,
              "date" to date.toDouble()
            ))
          }
        }
      } catch (e: Exception) {
        throw Exception("Failed to query SMS: ${e.message}")
      }

      return@AsyncFunction smsList
    }
  }
}
