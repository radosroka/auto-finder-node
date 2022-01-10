
var selected_rows = []
var last_selected = undefined

const threshold = 24191006
const click_color = 'table-warning'
const dblclick_color = 'table-primary'
const new_records_color = 'table-success'


$(document).ready(function() {

    $('html').click(function(){
        $('#context_menu_lists').css('display', 'none')
    });

    $('div.item').click(function (){
        const list_id = $(this).attr('list_id')
        for (index in selected_rows) {
            $.get('/manage_list_content?operation=add&list_id=' + list_id + '&car_id=' + selected_rows[index],
                  function (data){
                  })
        }
    });

    $('tr.clickable-query-row').click(function(){

        if (last_selected) {
            $('#' + last_selected).removeClass(click_color);
        }

        $(this).addClass(click_color);
        last_selected = $(this).attr("id")
    });

    $('tr.clickable-query-row').dblclick(function(){

        const id = $(this).attr('id')

        $(this).removeClass(click_color);
        $(this).removeClass(new_records_color);

        if ($(this).hasClass(dblclick_color)) {
            $(this).removeClass(dblclick_color);

            if (parseInt(id) > threshold ) {
                $(this).addClass(new_records_color);
            }

            const index = selected_rows.indexOf(id);
            if (index > -1) {
                selected_rows.splice(index, 1);
            }

        } else {
            $(this).addClass(dblclick_color);
            selected_rows.push(id);
        }
    });


    $('tr.clickable-query-row').contextmenu(function(e){

        $('#context_menu_lists').css("display", "none")

        // only for selected items
        if (!$(this).hasClass(dblclick_color)) {
            return false;
        }

        var x = e.pageX;
        var y = e.pageY;

        $('#context_menu_lists').css("left", x.toString() + "px")
        $('#context_menu_lists').css("top", y.toString() + "px")
        $('#context_menu_lists').css("display", "block")

        return false;

    });
});
