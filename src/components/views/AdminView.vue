<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { toiletService } from "../../services/toiletService.ts"
import BaseButton from "../ui/BaseButton.vue"
import { getThumbnailUrl } from "../utils/imageUtils.ts"
import EditToiletModal from "../features/EditToiletModal.vue";
import type {Toilet} from "../../types.ts";


const emit = defineEmits(['logout', 'teleport'])

const props = defineProps<{
  focusId?: string | null
}>()

const pendingToilets = ref<Toilet[]>([])
const isLoading = ref(false)
const expandedCardId = ref<string | null>(null)
const toast = useToast()

// --- СТАН ДЛЯ МОДАЛЬНОГО ВІКНА РЕДАГУВАННЯ ---
const isEditModalOpen = ref(false)
const selectedToiletForEdit = ref<Toilet | null>(null)

const openEditModal = (toilet: Toilet) => {
  selectedToiletForEdit.value = toilet
  isEditModalOpen.value = true
}

const handleToiletSaved = () => {
  isEditModalOpen.value = false
  loadPendingToilets()
}

const loadPendingToilets = async () => {
  isLoading.value = true
  try {
    const data = await toiletService.fetchPendingToilets()
    pendingToilets.value = data || []
  } catch (error: any) {
    toast.error('Не вдалося завантажити список заявок.')
  } finally {
    isLoading.value = false
  }
}

watch(() => props.focusId, (newId) => {
  if (newId) {
    expandedCardId.value = newId
    setTimeout(() => {
      const el = document.getElementById(`toilet-card-${newId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }
}, { immediate: true })

const toggleDetails = (id: string) => {
  if (expandedCardId.value === id) expandedCardId.value = null
  else expandedCardId.value = id
}

const handleApprove = async (id: string) => {
  try {
    await toiletService.updateToiletStatus(id, 'approved')
    toast.success('Вбиральню успішно додано на мапу!')
    pendingToilets.value = pendingToilets.value.filter(t => t.id !== id)
  } catch (error: any) {
    toast.error('Помилка при затвердженні.')
  }
}

const handleReject = async (id: string) => {
  if (!confirm('Ви впевнені, що хочете відхилити та видалити цю заявку?')) return

  const toiletToDelete = pendingToilets.value.find(t => t.id === id)
  const imageUrls = toiletToDelete?.toilet_images?.map(img => img.image_url) || []

  try {
    await toiletService.deleteToilet(id, imageUrls)
    toast.info('Заявку та пов’язані фото видалено.')
    pendingToilets.value = pendingToilets.value.filter(t => t.id !== id)
  } catch (error: any) {
    toast.error('Помилка при видаленні.')
  }
}

onMounted(() => {
  loadPendingToilets()
})
</script>

<template>
  <div class="relative w-full h-full bg-slate-50 overflow-y-auto px-4 py-20 sm:p-24 flex flex-col items-center">
    <div class="w-full max-w-3xl">

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Панель модератора</h1>
          <p class="text-sm text-slate-500 mt-1">Черга перевірки нових локацій вбиралень</p>
        </div>
        <div class="flex items-center gap-3 self-start sm:self-auto">
          <div class="bg-indigo-50 text-indigo-700 font-semibold px-4 py-2 rounded-xl text-sm">
            Очікують: {{ pendingToilets.length }}
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
        <span class="material-symbols-outlined text-[32px] animate-spin">sync</span>
        <p class="text-sm">Завантаження заявок...</p>
      </div>

      <div v-else-if="pendingToilets.length === 0" class="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
        <span class="material-symbols-outlined text-[48px] text-slate-300 mb-2">done_all</span>
        <h3 class="font-bold text-slate-700 text-lg">Черга порожня</h3>
        <p class="text-slate-400 text-sm mt-1">Усі надіслані користувачами локації вже оброблені.</p>
      </div>

      <div v-else class="flex flex-col gap-5">
        <div
            v-for="toilet in pendingToilets"
            :key="toilet.id"
            :id="'toilet-card-' + toilet.id"
            class="bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md overflow-hidden flex flex-col"
        >
          <div class="p-5 flex flex-col md:flex-row gap-5">
            <div v-if="toilet.toilet_images && toilet.toilet_images.length > 0" class="w-full md:w-32 h-32 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">
              <img :src="getThumbnailUrl(toilet.toilet_images[0].image_url)" class="w-full h-full object-cover" alt="Фото вбиральні" />
            </div>
            <div v-else class="w-full md:w-32 h-32 shrink-0 rounded-xl flex flex-col items-center justify-center bg-slate-50 border border-slate-100 text-slate-400">
              <span class="material-symbols-outlined text-[32px]">no_photography</span>
              <span class="text-[10px] uppercase font-bold mt-1">Немає фото</span>
            </div>

            <div class="flex-1 min-w-0 flex flex-col justify-center">
              <div class="flex items-center gap-2 mb-2">
                <span class="px-2.5 py-1 text-xs font-bold rounded-lg"
                      :class="toilet.type === 'public' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'">
                  {{ toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет' }}
                </span>
                <span v-if="toilet.created_at" class="text-xs text-slate-400 font-medium">
  {{ new Date(toilet.created_at).toLocaleDateString('uk-UA') }}
</span>
              </div>

              <p v-if="toilet.user_comment" class="text-sm text-slate-600 italic mb-3 line-clamp-2">
                «{{ toilet.user_comment }}»
              </p>
              <p class="text-sm text-slate-400 italic mb-3" v-else>Коментар відсутній</p>

              <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 font-medium mt-auto">
  <span v-if="toilet.latitude !== undefined && toilet.longitude !== undefined" class="flex items-center gap-1.5">
    <span class="material-symbols-outlined text-[16px] text-indigo-400">pin_drop</span>
    {{ toilet.latitude.toFixed(5) }}, {{ toilet.longitude.toFixed(5) }}
  </span>
              </div>
            </div>

            <div class="flex flex-col gap-2 shrink-0 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 justify-center">
              <BaseButton
                  variant="outline"
                  class="py-2! px-4! w-full flex justify-center !text-slate-600 !border-slate-200 hover:!bg-slate-50"
                  @click="toggleDetails(toilet.id)"
              >
                <span class="material-symbols-outlined text-[18px] transition-transform duration-200" :class="{'rotate-180': expandedCardId === toilet.id}">expand_more</span>
                {{ expandedCardId === toilet.id ? 'Сховати деталі' : 'Детальніше' }}
              </BaseButton>

              <BaseButton
                  variant="outline"
                  class="py-2! px-4! w-full flex justify-center bg-indigo-50! border-indigo-100! text-indigo-700! hover:bg-indigo-100!"
                  @click="emit('teleport', toilet.id, toilet.latitude, toilet.longitude)"
              >
                <span class="material-symbols-outlined text-[18px]">my_location</span>
                На мапі
              </BaseButton>

              <div class="flex gap-2 w-full mt-auto">
                <BaseButton
                    variant="outline"
                    class="py-2! px-3! flex-1 justify-center !text-blue-600 !border-blue-200 hover:!bg-blue-50"
                    @click="openEditModal(toilet)"
                    title="Редагувати"
                >
                  <span class="material-symbols-outlined text-[18px]">edit</span>
                </BaseButton>

                <BaseButton
                    variant="outline"
                    class="py-2! px-3! flex-1 justify-center !text-red-600 !border-red-200 hover:!bg-red-50"
                    @click="handleReject(toilet.id)"
                    title="Відхилити"
                >
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </BaseButton>

                <BaseButton
                    variant="success"
                    class="py-2! px-3! flex-[2] justify-center shadow-sm shadow-emerald-100"
                    @click="handleApprove(toilet.id)"
                    title="Підтвердити"
                >
                  <span class="material-symbols-outlined text-[18px]">check_circle</span>
                </BaseButton>
              </div>
            </div>
          </div>

          <div v-show="expandedCardId === toilet.id" class="border-t border-slate-100 bg-slate-50/50 p-5">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Всі параметри заявки</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
              <div v-if="toilet.type === 'public'" class="flex flex-col gap-1">
                <span class="text-slate-500 text-xs font-medium">Вартість</span>
                <span class="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-emerald-600">payments</span>
                  {{ Number(toilet.price) === 0 ? 'Безкоштовно' : `${toilet.price} грн` }}
                </span>
              </div>
              <div v-if="toilet.work_hours" class="flex flex-col gap-1">
                <span class="text-slate-500 text-xs font-medium">Години роботи</span>
                <span class="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-blue-500">schedule</span>
                  {{ toilet.work_hours }}
                </span>
              </div>
              <div v-if="toilet.address" class="flex flex-col gap-1 sm:col-span-2 md:col-span-1">
                <span class="text-slate-500 text-xs font-medium">Адреса</span>
                <span class="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-indigo-400">signpost</span>
                  {{ toilet.address }}
                </span>
              </div>
              <div v-if="toilet.type === 'public' && (toilet.stalls_count || toilet.urinals_count)" class="flex flex-col gap-1">
                <span class="text-slate-500 text-xs font-medium">Місткість</span>
                <div class="flex items-center gap-3">
                  <span v-if="toilet.stalls_count" class="text-slate-800 font-semibold flex items-center gap-1" title="Кабінки">
                    <span class="material-symbols-outlined text-[16px] text-slate-500">door_front</span> {{ toilet.stalls_count }}
                  </span>
                  <span v-if="toilet.urinals_count" class="text-slate-800 font-semibold flex items-center gap-1" title="Пісуари">
                    <span class="material-symbols-outlined text-[16px] text-slate-500">man</span> {{ toilet.urinals_count }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100 border-dashed">
              <span v-if="toilet.has_wheelchair_accessible" class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">accessible</span> Доступно для візків
              </span>
              <span v-if="toilet.has_washbasin" class="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">soap</span> Є рукомийник
              </span>
              <span v-if="toilet.type === 'bio' && toilet.is_lock_broken" class="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[11px] font-bold px-2.5 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">lock_open</span> Замок зламано
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальне вікно редагування -->
    <EditToiletModal
        :is-open="isEditModalOpen"
        :toilet="selectedToiletForEdit"
        @close="isEditModalOpen = false"
        @saved="handleToiletSaved"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
</style>