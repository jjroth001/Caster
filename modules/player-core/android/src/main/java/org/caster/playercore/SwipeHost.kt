package org.caster.playercore

import android.content.Context
import android.view.MotionEvent
import android.view.ViewConfiguration
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.absoluteValue

/**
 * Wraps a row that scrolls sideways inside the swipeable tabs. A sideways swipe that starts on
 * the row always moves the row, never the tabs (left to themselves, the two raced and the tabs
 * won about half the time). An up-or-down swipe is handed back so the page still scrolls.
 */
class SwipeHostView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var startX = 0f
  private var startY = 0f
  private var decided = false

  override fun onInterceptTouchEvent(e: MotionEvent): Boolean {
    when (e.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        startX = e.x
        startY = e.y
        decided = false
        // Until it's clear which way the finger is going, nothing above may take the touch.
        parent?.requestDisallowInterceptTouchEvent(true)
      }
      MotionEvent.ACTION_MOVE -> if (!decided) {
        val dx = (e.x - startX).absoluteValue
        val dy = (e.y - startY).absoluteValue
        if (dx > touchSlop || dy > touchSlop) {
          decided = true
          // Mostly up or down: let the page scroll. Mostly sideways: keep it for the row.
          if (dy > dx) parent?.requestDisallowInterceptTouchEvent(false)
        }
      }
    }
    return false
  }
}
