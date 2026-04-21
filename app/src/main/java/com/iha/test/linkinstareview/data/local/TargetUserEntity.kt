package com.iha.test.linkinstareview.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "target_users")
data class TargetUserEntity(
    @PrimaryKey val username: String,
    val createdAt: Long = System.currentTimeMillis()
)
