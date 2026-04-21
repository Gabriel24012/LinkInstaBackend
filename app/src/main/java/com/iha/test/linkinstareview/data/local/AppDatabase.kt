package com.iha.test.linkinstareview.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [TargetUserEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun targetUserDao(): TargetUserDao
}
