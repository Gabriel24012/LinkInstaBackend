package com.iha.test.linkinstareview.data.remote

import com.iha.test.linkinstareview.models.InteractionResult
import com.iha.test.linkinstareview.models.StartTrackResponse
import com.iha.test.linkinstareview.models.TrackRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface N8nApi {
    @POST("ig-track/start")
    suspend fun startTracking(@Body body: TrackRequest): retrofit2.Response<Unit>

    @GET("ig-track/status/{requestId}")
    suspend fun getStatus(@Path("requestId") requestId: String): InteractionResult
}
